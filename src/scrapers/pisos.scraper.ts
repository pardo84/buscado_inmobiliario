import * as cheerio from 'cheerio';
import { BaseScraper } from './base.scraper.js';
import { PropertyListing, PropertyType, OperationType, ListingStatus } from '../types/listing.js';
import { RoutineFilters } from '../types/routine.js';
import { Town } from '../types/locations.js';
import { parsePrice, parseRooms, parseBathrooms, parseSqm, generateListingId, isBankEntity } from '../utils/text.js';
import { logger } from '../utils/logger.js';

export class PisosScraper extends BaseScraper {
  name = 'pisos';
  private baseUrl = 'https://www.pisos.com';

  private mapOperation(op: OperationType): string {
    return op === OperationType.ALQUILER ? 'alquiler' : 'venta';
  }

  private mapPropertyType(type: PropertyType): string {
    switch (type) {
      case PropertyType.PISO:
        return 'pisos';
      case PropertyType.CASA:
        return 'casas';
      case PropertyType.PARKING:
        return 'garajes';
      case PropertyType.TERRENO:
        return 'terrenos';
      case PropertyType.LOCAL:
        return 'locales_comerciales';
      default:
        return 'pisos';
    }
  }

  private mapLocation(locId: string): { slug: string; town: string; neighborhood?: string } {
    switch (locId) {
      case 'all_granollers':
        return { slug: 'granollers', town: Town.GRANOLLERS };
      case 'cardedeu':
        return { slug: 'cardedeu', town: Town.CARDEDEU };
      case 'la_roca':
        return { slug: 'la_roca_del_valles', town: Town.LA_ROCA };
      case 'les_franqueses':
        return { slug: 'les_franqueses_del_valles', town: Town.LES_FRANQUESES };
      default:
        if (locId.startsWith('gr_')) {
          const b = locId.replace('gr_', '');
          return { slug: `granollers_${b}`, town: Town.GRANOLLERS, neighborhood: b.replace(/_/g, ' ') };
        }
        return { slug: 'granollers', town: Town.GRANOLLERS };
    }
  }

  async search(filters: RoutineFilters): Promise<PropertyListing[]> {
    const listings: PropertyListing[] = [];
    const opStr = this.mapOperation(filters.operationType);

    const types = filters.propertyTypes && filters.propertyTypes.length > 0
      ? filters.propertyTypes
      : [PropertyType.CUALQUIERA];

    const locations = filters.locations && filters.locations.length > 0
      ? filters.locations
      : ['all_granollers'];

    for (const type of types) {
      const typeSlug = this.mapPropertyType(type);

      for (const locId of locations) {
        const { slug: locSlug, town, neighborhood } = this.mapLocation(locId);

        try {
          const url = `${this.baseUrl}/${opStr}/${typeSlug}-${locSlug}/`;
          logger.info({ scraper: this.name, url, type, locId }, 'Fetching Pisos.com page');

          const html = await this.fetchHtml(url);
          const parsed = this.parseListingsFromHtml(html, town, neighborhood, filters);
          listings.push(...parsed);
        } catch (err: any) {
          logger.warn({ scraper: this.name, type, locId, error: err.message }, 'Failed to fetch Pisos.com');
        }
      }
    }

    const unique = new Map<string, PropertyListing>();
    for (const item of listings) {
      if (!unique.has(item.url)) {
        unique.set(item.url, item);
      }
    }

    return Array.from(unique.values());
  }

  private parseListingsFromHtml(
    html: string,
    town: string,
    defaultNeighborhood: string | undefined,
    filters: RoutineFilters
  ): PropertyListing[] {
    const $ = cheerio.load(html);
    const results: PropertyListing[] = [];

    $('.ad-preview, .grid-item, article').each((_, el) => {
      try {
        const card = $(el);
        const link = card.find('a[href*="/comprar/"], a[href*="/venta/"], a[href*="/alquiler/"], a.ad-preview__title').first();
        let href = link.attr('href') || card.attr('data-navigate-url');

        if (!href) return;
        if (href.includes('javascript:') || href.startsWith('#')) return;

        const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;
        let title = link.text().trim() || card.find('h3, .title, .ad-preview__title').first().text().trim();

        const priceText = card.find('.ad-preview__price, .price, .jsPrice').first().text().trim();
        const price = parsePrice(priceText);
        if (price <= 0) return;

        if (filters.minPrice && price < filters.minPrice) return;
        if (filters.maxPrice && price > filters.maxPrice) return;

        const charText = card.find('.ad-preview__characteristics, .characteristics, .item-details').text();
        const rooms = parseRooms(charText);
        const bathrooms = parseBathrooms(charText);
        const sqm = parseSqm(charText);

        if (filters.minRooms && rooms && rooms < filters.minRooms) return;
        if (filters.minSqm && sqm && sqm < filters.minSqm) return;

        const allText = card.text().toLowerCase();
        const features: string[] = [];
        if (allText.includes('ascensor')) features.push('ascensor');
        if (allText.includes('parking') || allText.includes('garaje')) features.push('parking');
        if (allText.includes('terraza') || allText.includes('balcón')) features.push('terraza');
        if (allText.includes('piscina')) features.push('piscina');
        if (allText.includes('jardín')) features.push('jardín');

        if (filters.mustHaveElevator && !features.includes('ascensor')) return;
        if (filters.mustHaveParking && !features.includes('parking')) return;
        if (filters.mustHaveTerrace && !features.includes('terraza')) return;
        if (filters.mustHavePool && !features.includes('piscina')) return;

        const imgEl = card.find('img').first();
        const img = imgEl.attr('src') || imgEl.attr('data-src');
        const photos = img && !img.includes('data:image') && !img.includes('spacer') ? [img] : [];

        // Real Agency Name
        const agency = card.find('.ad-preview__agency, .agency-logo, .logo-inmobiliaria, .agency-name').text().trim() || undefined;

        // Accurate bank detection
        const isBank = isBankEntity(agency, title, card.text());
        if (filters.bankPropertiesOnly && !isBank) return;
        if (filters.excludeBankProperties && isBank) return;

        let propType = PropertyType.PISO;
        if (title.toLowerCase().includes('casa') || title.toLowerCase().includes('chalet') || title.toLowerCase().includes('torre')) {
          propType = PropertyType.CASA;
        } else if (title.toLowerCase().includes('dúplex') || title.toLowerCase().includes('duplex')) {
          propType = PropertyType.DUPLEX;
        } else if (title.toLowerCase().includes('ático') || title.toLowerCase().includes('atico')) {
          propType = PropertyType.ATICO;
        } else if (title.toLowerCase().includes('garaje') || title.toLowerCase().includes('parking')) {
          propType = PropertyType.PARKING;
        } else if (title.toLowerCase().includes('terreno') || title.toLowerCase().includes('solar')) {
          propType = PropertyType.TERRENO;
        }

        const id = generateListingId('pisos', fullUrl);
        results.push({
          id,
          portal: 'pisos.com',
          url: fullUrl,
          title: title || `${propType.toUpperCase()} en ${town}`,
          price,
          currency: 'EUR',
          pricePerSqm: sqm ? Math.round(price / sqm) : undefined,
          propertyType: propType,
          operationType: filters.operationType,
          town,
          neighborhood: defaultNeighborhood,
          rooms,
          bathrooms,
          sqm,
          features,
          photos,
          agency,
          isBankProperty: isBank,
          status: ListingStatus.ACTIVE,
          firstSeenAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        });
      } catch {
        // Skip
      }
    });

    return results;
  }
}
