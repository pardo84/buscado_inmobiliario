import * as cheerio from 'cheerio';
import { BaseScraper } from './base.scraper.js';
import { PropertyListing, PropertyType, OperationType, ListingStatus } from '../types/listing.js';
import { RoutineFilters } from '../types/routine.js';
import { Town } from '../types/locations.js';
import { parsePrice, parseRooms, parseBathrooms, parseSqm, generateListingId, isBankEntity } from '../utils/text.js';
import { logger } from '../utils/logger.js';

export class HabitacliaScraper extends BaseScraper {
  name = 'habitaclia';
  private baseUrl = 'https://www.habitaclia.com';

  private mapOperation(op: OperationType): string {
    return op === OperationType.ALQUILER ? 'alquiler' : 'comprar';
  }

  private mapPropertyType(type: PropertyType): string {
    switch (type) {
      case PropertyType.CASA:
        return 'casas';
      case PropertyType.PARKING:
        return 'parkings';
      case PropertyType.TERRENO:
        return 'terrenos_y_solares';
      case PropertyType.LOCAL:
        return 'locales_comerciales';
      default:
        return 'vivienda';
    }
  }

  private mapLocation(locId: string): { slug: string; town: string; neighborhood?: string } {
    switch (locId) {
      case 'all_granollers':
        return { slug: 'granollers-centre', town: Town.GRANOLLERS };
      case 'cardedeu':
        return { slug: 'cardedeu-centre', town: Town.CARDEDEU };
      case 'la_roca':
        return { slug: 'la_roca_del_valles', town: Town.LA_ROCA };
      case 'les_franqueses':
        return { slug: 'les_franqueses_del_valles', town: Town.LES_FRANQUESES };
      default:
        if (locId.startsWith('gr_')) {
          const barrioSlug = locId.replace('gr_', '');
          return {
            slug: `granollers-${barrioSlug}`,
            town: Town.GRANOLLERS,
            neighborhood: barrioSlug.replace(/_/g, ' '),
          };
        }
        return { slug: 'granollers-centre', town: Town.GRANOLLERS };
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
          const url = `${this.baseUrl}/${opStr}-${typeSlug}-${locSlug}.htm`;
          logger.info({ scraper: this.name, url, type, locId }, 'Fetching Habitaclia search page');

          const html = await this.fetchHtml(url);
          const parsed = this.parseListingsFromHtml(html, town, neighborhood, filters);
          listings.push(...parsed);
        } catch (err: any) {
          logger.warn({ scraper: this.name, type, locId, error: err.message }, 'Failed to fetch Habitaclia listings');
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

    const items = $('article.list-item, .list-item-content, .list-item-vertical, .js-list-item, .list-item');

    items.each((_, el) => {
      try {
        const itemEl = $(el);
        const linkEl = itemEl.find('.list-item-title a, h3.list-item-title a, a.list-item-title, h3 a').first();
        let href = linkEl.attr('href') || itemEl.find('a').first().attr('href');
        let title = linkEl.text().trim() || itemEl.find('.list-item-title, h3').first().text().trim();

        if (!href || !href.includes('.htm')) {
          return;
        }

        const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;

        const priceText = itemEl.find('.font-2, .price, .list-item-price, [itemprop="price"], .font-1').first().text().trim();
        const price = parsePrice(priceText);
        if (price <= 0) return;

        if (filters.minPrice && price < filters.minPrice) return;
        if (filters.maxPrice && price > filters.maxPrice) return;

        const featureText = itemEl.find('.list-item-feature, .list-item-features, p.list-item-feature, .item-detail').text().trim();
        const rooms = parseRooms(featureText);
        const bathrooms = parseBathrooms(featureText);
        const sqm = parseSqm(featureText);

        if (filters.minRooms && rooms && rooms < filters.minRooms) return;
        if (filters.minSqm && sqm && sqm < filters.minSqm) return;

        const allTextLower = itemEl.text().toLowerCase();
        const features: string[] = [];
        if (allTextLower.includes('ascensor')) features.push('ascensor');
        if (allTextLower.includes('parking') || allTextLower.includes('garaje') || allTextLower.includes('aparcamiento')) features.push('parking');
        if (allTextLower.includes('terraza') || allTextLower.includes('balcón') || allTextLower.includes('balco')) features.push('terraza');
        if (allTextLower.includes('piscina')) features.push('piscina');
        if (allTextLower.includes('jardín') || allTextLower.includes('jardi')) features.push('jardín');

        if (filters.mustHaveElevator && !features.includes('ascensor')) return;
        if (filters.mustHaveParking && !features.includes('parking')) return;
        if (filters.mustHaveTerrace && !features.includes('terraza')) return;
        if (filters.mustHavePool && !features.includes('piscina')) return;

        const agency = itemEl.find('.list-item-agency, .agency-logo, .name-agency').text().trim() || undefined;

        // Accurate bank check
        const isBank = isBankEntity(agency, title, itemEl.text());
        if (filters.bankPropertiesOnly && !isBank) return;
        if (filters.excludeBankProperties && isBank) return;

        const imgEl = itemEl.find('img.lazy, img.list-item-photo, img');
        const imgSrc = imgEl.attr('data-src') || imgEl.attr('data-original') || imgEl.attr('src');
        const photos: string[] = [];
        if (imgSrc && !imgSrc.includes('spacer') && !imgSrc.includes('pixel')) {
          photos.push(imgSrc.startsWith('//') ? `https:${imgSrc}` : imgSrc);
        }

        let propertyType = PropertyType.PISO;
        if (allTextLower.includes('casa') || allTextLower.includes('chalet') || allTextLower.includes('torre')) {
          propertyType = PropertyType.CASA;
        } else if (allTextLower.includes('dúplex') || allTextLower.includes('duplex')) {
          propertyType = PropertyType.DUPLEX;
        } else if (allTextLower.includes('ático') || allTextLower.includes('atico')) {
          propertyType = PropertyType.ATICO;
        } else if (allTextLower.includes('parking') || allTextLower.includes('garaje')) {
          propertyType = PropertyType.PARKING;
        } else if (allTextLower.includes('terreno') || allTextLower.includes('solar')) {
          propertyType = PropertyType.TERRENO;
        }

        const id = generateListingId('habitaclia', fullUrl);

        results.push({
          id,
          portal: 'habitaclia',
          url: fullUrl,
          title: title || `${propertyType.toUpperCase()} en ${town}`,
          price,
          currency: 'EUR',
          pricePerSqm: sqm && sqm > 0 ? Math.round(price / sqm) : undefined,
          propertyType,
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
