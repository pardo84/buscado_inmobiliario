import * as cheerio from 'cheerio';
import { BaseScraper } from './base.scraper.js';
import { PropertyListing, PropertyType, OperationType, ListingStatus } from '../types/listing.js';
import { RoutineFilters } from '../types/routine.js';
import { Town } from '../types/locations.js';
import { parsePrice, parseRooms, parseBathrooms, parseSqm, generateListingId, isBankEntity, detectPropertyType, cleanAgencyName } from '../utils/text.js';
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
      case PropertyType.DUPLEX:
        return 'duplex';
      case PropertyType.ATICO:
        return 'aticos';
      case PropertyType.PARKING:
        return 'garajes';
      case PropertyType.TERRENO:
        return 'terrenos';
      case PropertyType.LOCAL:
        return 'locales_comerciales';
      case PropertyType.CUALQUIERA:
      default:
        return 'viviendas';
    }
  }

  private mapLocation(locId: string): { slug: string; town: Town } {
    switch (locId) {
      case 'cardedeu':
        return { slug: 'cardedeu', town: Town.CARDEDEU };
      case 'la_roca':
        return { slug: 'la_roca_del_valles', town: Town.LA_ROCA };
      case 'les_franqueses':
        return { slug: 'les_franqueses_del_valles', town: Town.LES_FRANQUESES };
      case 'all_granollers':
      default:
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

    // Deduplicate distinct types slug to query
    const typeSlugs = Array.from(new Set(types.map(t => this.mapPropertyType(t))));

    // Deduplicate distinct towns
    const townSlugsMap = new Map<string, { slug: string; town: Town }>();
    for (const locId of locations) {
      const locInfo = this.mapLocation(locId);
      townSlugsMap.set(locInfo.slug, locInfo);
    }

    for (const typeSlug of typeSlugs) {
      for (const [_, locInfo] of townSlugsMap.entries()) {
        try {
          const url = `${this.baseUrl}/${opStr}/${typeSlug}-${locInfo.slug}/`;
          logger.info({ scraper: this.name, url, typeSlug, town: locInfo.town }, 'Fetching Pisos.com page');

          const html = await this.fetchHtml(url);
          const parsed = this.parseListingsFromHtml(html, locInfo.town, filters);
          listings.push(...parsed);
        } catch (err: any) {
          logger.warn({ scraper: this.name, typeSlug, town: locInfo.town, error: err.message }, 'Failed to fetch Pisos.com');
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

        // Real Local Agency Name extraction
        let agency: string | undefined = undefined;
        const logoHref = card.find('.ad-preview__logo [data-lnk-href], .ad-preview__agency [data-lnk-href]').attr('data-lnk-href');
        if (logoHref) {
          const match = logoHref.match(/inmobiliaria-([^/]+)/i);
          if (match && match[1]) {
            agency = cleanAgencyName(match[1]);
          }
        }
        if (!agency) {
          const logoImg = card.find('.ad-preview__logo img, .ad-preview__agency img');
          const alt = logoImg.attr('alt') || logoImg.attr('title');
          if (alt && alt.toLowerCase() !== 'logo' && alt.length > 2) {
            agency = cleanAgencyName(alt);
          }
        }
        if (!agency) {
          const desc = card.find('.ad-preview__description').text();
          const aicatMatch = desc.match(/([A-Z0-9\s.,ÁÉÍÓÚÀÈÒÇ]+?)\s+(?:es una agencia|és una agència|AICAT|API colegiado)/i);
          if (aicatMatch && aicatMatch[1] && aicatMatch[1].trim().length < 40) {
            agency = cleanAgencyName(aicatMatch[1]);
          }
        }
        if (!agency) {
          const rawText = card.find('.ad-preview__agency, .agency-name').text().trim();
          if (rawText && rawText.length > 2) agency = cleanAgencyName(rawText);
        }

        // Accurate bank detection
        const isBank = isBankEntity(agency, title, card.text());
        if (filters.bankPropertiesOnly && !isBank) return;
        if (filters.excludeBankProperties && isBank) return;
        const propType = detectPropertyType(fullUrl, title, card.text());

        if (
          filters.propertyTypes &&
          filters.propertyTypes.length > 0 &&
          !filters.propertyTypes.includes(PropertyType.CUALQUIERA) &&
          !filters.propertyTypes.includes(propType)
        ) {
          return;
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
          neighborhood: undefined,
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
