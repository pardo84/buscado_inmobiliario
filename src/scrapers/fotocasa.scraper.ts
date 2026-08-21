import * as cheerio from 'cheerio';
import { BaseScraper } from './base.scraper.js';
import { PropertyListing, PropertyType, OperationType, ListingStatus } from '../types/listing.js';
import { RoutineFilters } from '../types/routine.js';
import { Town } from '../types/locations.js';
import { parsePrice, parseRooms, parseBathrooms, parseSqm, generateListingId, isBankEntity, detectPropertyType } from '../utils/text.js';
import { logger } from '../utils/logger.js';

export class FotocasaScraper extends BaseScraper {
  name = 'fotocasa';
  private baseUrl = 'https://www.fotocasa.es';

  private mapOperation(op: OperationType): string {
    return op === OperationType.ALQUILER ? 'alquiler' : 'comprar';
  }

  private mapPropertyType(type: PropertyType): string {
    switch (type) {
      case PropertyType.PISO:
      case PropertyType.CASA:
      case PropertyType.DUPLEX:
      case PropertyType.ATICO:
      case PropertyType.CUALQUIERA:
        return 'viviendas';
      case PropertyType.PARKING:
        return 'garajes';
      case PropertyType.TERRENO:
        return 'terrenos';
      case PropertyType.LOCAL:
        return 'locales';
      default:
        return 'viviendas';
    }
  }

  private mapLocation(locId: string): { slug: string; town: Town } {
    switch (locId) {
      case 'cardedeu':
        return { slug: 'cardedeu/todas-las-zonas/l', town: Town.CARDEDEU };
      case 'la_roca':
        return { slug: 'la-roca-del-valles/todas-las-zonas/l', town: Town.LA_ROCA };
      case 'les_franqueses':
        return { slug: 'les-franqueses-del-valles/todas-las-zonas/l', town: Town.LES_FRANQUESES };
      case 'all_granollers':
      default:
        return { slug: 'granollers/todas-las-zonas/l', town: Town.GRANOLLERS };
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

    // Deduplicate towns to query
    const townMap = new Map<string, { slug: string; town: Town }>();
    for (const locId of locations) {
      const locInfo = this.mapLocation(locId);
      townMap.set(locInfo.slug, locInfo);
    }

    for (const typeSlug of typeSlugs) {
      for (const [_, locInfo] of townMap.entries()) {
        try {
          const url = `${this.baseUrl}/es/${opStr}/${typeSlug}/${locInfo.slug}`;
          logger.info({ scraper: this.name, url, typeSlug, town: locInfo.town }, 'Fetching Fotocasa search page');

          const html = await this.fetchHtml(url);
          const parsed = this.parseListingsFromHtml(html, locInfo.town, filters);
          listings.push(...parsed);
        } catch (err: any) {
          logger.warn({ scraper: this.name, typeSlug, town: locInfo.town, error: err.message }, 'Failed to fetch Fotocasa listings');
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

  private parseListingsFromHtml(html: string, town: string, filters: RoutineFilters): PropertyListing[] {
    const $ = cheerio.load(html);
    const results: PropertyListing[] = [];

    $('article, div[data-id], .re-Card, .re-CardPackMinimal').each((_, el) => {
      try {
        const card = $(el);
        const link = card.find('a[href*="/es/comprar/vivienda/"], a[href*="/es/alquiler/vivienda/"], a[href*="/vivienda/"]').first();
        let href = link.attr('href');
        if (!href) return;

        const cleanPath = href.split('?')[0];
        const fullUrl = cleanPath.startsWith('http') ? cleanPath : `${this.baseUrl}${cleanPath}`;

        const cardText = card.text();
        const priceText = card.find('span:contains("€"), span[class*="price"], .re-CardPrice').first().text().trim() ||
          (cardText.match(/(\d{1,3}(?:\.\d{3})+|\d+)\s*€/)?.[0] ?? '');

        const price = parsePrice(priceText);
        if (price <= 0) return;

        if (filters.minPrice && price < filters.minPrice) return;
        if (filters.maxPrice && price > filters.maxPrice) return;

        const rooms = parseRooms(cardText);
        const bathrooms = parseBathrooms(cardText);
        const sqm = parseSqm(cardText);

        if (filters.minRooms && rooms && rooms < filters.minRooms) return;
        if (filters.minSqm && sqm && sqm < filters.minSqm) return;

        const allLower = cardText.toLowerCase();
        const features: string[] = [];
        if (allLower.includes('ascensor')) features.push('ascensor');
        if (allLower.includes('parking') || allLower.includes('garaje')) features.push('parking');
        if (allLower.includes('terraza') || allLower.includes('balcón')) features.push('terraza');
        if (allLower.includes('piscina')) features.push('piscina');
        if (allLower.includes('jardín')) features.push('jardín');

        if (filters.mustHaveElevator && !features.includes('ascensor')) return;
        if (filters.mustHaveParking && !features.includes('parking')) return;
        if (filters.mustHaveTerrace && !features.includes('terraza')) return;
        if (filters.mustHavePool && !features.includes('piscina')) return;

        let title = card.find('h3, .re-CardTitle, a.re-Card-title').first().text().trim();
        if (!title || title.length < 5) {
          const matchTitle = cardText.match(/(Piso|Casa|Dúplex|Ático|Chalet|Planta baja)\s+en\s+[^0-9\n]+/i);
          title = matchTitle ? matchTitle[0].trim() : `Vivienda en ${town}`;
        }

        // Agency name
        const agency = card.find('.re-Card-advertiser, .re-CardAdvertiser-name, a[href*="/inmobiliaria-"]').text().trim() || undefined;

        // Accurate bank detection
        const isBank = isBankEntity(agency, title, cardText);
        if (filters.bankPropertiesOnly && !isBank) return;
        if (filters.excludeBankProperties && isBank) return;

        const img = card.find('img').first().attr('src') || card.find('img').first().attr('data-src');
        const photos = img && !img.includes('data:image') && !img.includes('pixel') ? [img] : [];

        const propType = detectPropertyType(fullUrl, title, cardText);

        if (
          filters.propertyTypes &&
          filters.propertyTypes.length > 0 &&
          !filters.propertyTypes.includes(PropertyType.CUALQUIERA) &&
          !filters.propertyTypes.includes(propType)
        ) {
          return;
        }

        const id = generateListingId('fotocasa', fullUrl);
        results.push({
          id,
          portal: 'fotocasa',
          url: fullUrl,
          title,
          price,
          currency: 'EUR',
          pricePerSqm: sqm ? Math.round(price / sqm) : undefined,
          propertyType: propType,
          operationType: filters.operationType,
          town,
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
