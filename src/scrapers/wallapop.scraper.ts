import * as cheerio from 'cheerio';
import { BaseScraper } from './base.scraper.js';
import { PropertyListing, PropertyType, OperationType, ListingStatus } from '../types/listing.js';
import { RoutineFilters } from '../types/routine.js';
import { Town, ALL_LOCATIONS, GRANOLLERS_NEIGHBORHOODS } from '../types/locations.js';
import {
  parseRooms,
  parseBathrooms,
  parseSqm,
  generateListingId,
  isBankEntity,
  detectPropertyType,
  cleanAgencyName,
} from '../utils/text.js';
import { logger } from '../utils/logger.js';

export class WallapopScraper extends BaseScraper {
  name = 'wallapop';

  private townSlugMap: Record<string, { town: Town; slug: string }> = {
    granollers: { town: Town.GRANOLLERS, slug: 'granollers' },
    cardedeu: { town: Town.CARDEDEU, slug: 'cardedeu' },
    la_roca: { town: Town.LA_ROCA, slug: 'la-roca-del-valles' },
    les_franqueses: { town: Town.LES_FRANQUESES, slug: 'les-franqueses-del-valles' },
  };

  async search(filters: RoutineFilters): Promise<PropertyListing[]> {
    const listings: PropertyListing[] = [];
    const targetTownSlugs = new Set<string>();

    const locIds = filters.locations && filters.locations.length > 0
      ? filters.locations
      : ['all_granollers'];

    for (const locId of locIds) {
      if (locId.startsWith('gr_') || locId === 'all_granollers') {
        targetTownSlugs.add('granollers');
      } else if (this.townSlugMap[locId]) {
        targetTownSlugs.add(this.townSlugMap[locId].slug);
      }
    }

    for (const slug of targetTownSlugs) {
      try {
        const urlsToFetch: string[] = [];

        // If searching specifically for casas, also query the dedicated casas category
        if (
          filters.propertyTypes &&
          filters.propertyTypes.length === 1 &&
          filters.propertyTypes.includes(PropertyType.CASA)
        ) {
          urlsToFetch.push(`https://es.wallapop.com/inmobiliaria/casas/${slug}`);
        }

        urlsToFetch.push(`https://es.wallapop.com/inmobiliaria/${slug}`);

        for (const url of urlsToFetch) {
          logger.info({ scraper: this.name, url, townSlug: slug }, 'Fetching Wallapop search page');
          const html = await this.fetchHtml(url);
          if (!html) continue;

          const pageListings = this.parseListingsFromHtml(html, slug, filters);
          listings.push(...pageListings);
        }
      } catch (err: any) {
        logger.error({ scraper: this.name, slug, error: err.message }, 'Error scraping Wallapop for town');
      }
    }

    // Deduplicate by URL
    const unique = new Map<string, PropertyListing>();
    for (const l of listings) {
      if (!unique.has(l.url)) {
        unique.set(l.url, l);
      }
    }

    return Array.from(unique.values());
  }

  private parseListingsFromHtml(html: string, townSlug: string, filters: RoutineFilters): PropertyListing[] {
    const listings: PropertyListing[] = [];
    const $ = cheerio.load(html);

    const townName =
      townSlug === 'granollers' ? Town.GRANOLLERS :
      townSlug === 'cardedeu' ? Town.CARDEDEU :
      townSlug === 'la-roca-del-valles' ? Town.LA_ROCA :
      townSlug === 'les-franqueses-del-valles' ? Town.LES_FRANQUESES :
      Town.GRANOLLERS;

    const nextDataRaw = $('#__NEXT_DATA__').html();
    if (!nextDataRaw) {
      return listings;
    }

    try {
      const parsed = JSON.parse(nextDataRaw);
      const items: any[] = parsed.props?.pageProps?.seoLandingData?.items || [];

      for (const item of items) {
        if (!item || item.sold || item.reserved) continue;

        const title = (item.title || '').trim();
        const description = (item.description || '').trim();
        const fullText = `${title} ${description}`.toLowerCase();
        const price = Number(item.price) || 0;

        // Price Filter
        if (filters.minPrice && price < filters.minPrice) continue;
        if (filters.maxPrice && price > filters.maxPrice) continue;

        // Property Type detection & strict filter
        const propType = detectPropertyType(item.slugId || '', title, description);
        if (
          filters.propertyTypes &&
          filters.propertyTypes.length > 0 &&
          !filters.propertyTypes.includes(PropertyType.CUALQUIERA) &&
          !filters.propertyTypes.includes(propType)
        ) {
          continue;
        }

        // Operation Type detection
        const isRent =
          /alquiler|alquila|lloguer|lloga|habitaci[oó]n|arriendo/i.test(fullText) ||
          (price < 3500 && propType !== PropertyType.PARKING && propType !== PropertyType.TERRENO);
        const opType = isRent ? OperationType.ALQUILER : OperationType.VENTA;

        if (filters.operationType && filters.operationType !== opType) {
          continue;
        }

        // Rooms, Bathrooms, Sqm
        const rawRooms = item.itemRealEstate?.rooms || title;
        const rawBathrooms = item.itemRealEstate?.bathrooms || title;
        const rawSqm = item.itemRealEstate?.surface || title;

        const rooms = parseRooms(rawRooms) || parseRooms(description);
        const bathrooms = parseBathrooms(rawBathrooms) || parseBathrooms(description);
        const sqm = parseSqm(rawSqm) || parseSqm(description);

        if (filters.minRooms && rooms && rooms < filters.minRooms) continue;
        if (filters.minBathrooms && bathrooms && bathrooms < filters.minBathrooms) continue;
        if (filters.minSqm && sqm && sqm < filters.minSqm) continue;

        // Features
        const features: string[] = [];
        if (fullText.includes('ascensor')) features.push('ascensor');
        if (fullText.includes('parking') || fullText.includes('garaje') || fullText.includes('garatge')) features.push('parking');
        if (fullText.includes('terraza') || fullText.includes('balcón') || fullText.includes('balco') || fullText.includes('terrassa')) features.push('terraza');
        if (fullText.includes('piscina')) features.push('piscina');
        if (fullText.includes('jardín') || fullText.includes('jardi')) features.push('jardín');

        if (filters.mustHaveElevator && !features.includes('ascensor')) continue;
        if (filters.mustHaveParking && !features.includes('parking')) continue;
        if (filters.mustHaveTerrace && !features.includes('terraza')) continue;
        if (filters.mustHavePool && !features.includes('piscina')) continue;

        // Agency / Seller detection
        let agency: string | undefined = undefined;
        const sellerName = item.seller?.userName;
        if (sellerName && sellerName.trim().length > 1 && !sellerName.startsWith('_')) {
          agency = cleanAgencyName(sellerName);
        }

        // Bank detection
        const isBank = isBankEntity(agency, title, description);
        if (filters.bankPropertiesOnly && !isBank) continue;
        if (filters.excludeBankProperties && isBank) continue;

        // Photos
        const photos: string[] = [];
        if (Array.isArray(item.images)) {
          for (const img of item.images) {
            const src = img?.smallUrl || img?.originalUrl;
            if (src && !src.includes('spacer') && !src.includes('pixel')) {
              photos.push(src.replace('pictureSize=W320', 'pictureSize=W800'));
            }
          }
        }

        // Neighborhood detection for Granollers
        let neighborhood: string | undefined = undefined;
        if (townSlug === 'granollers') {
          for (const n of GRANOLLERS_NEIGHBORHOODS) {
            const nLower = n.name.toLowerCase();
            if (fullText.includes(nLower) || (item.slugId && item.slugId.toLowerCase().includes(n.id))) {
              neighborhood = n.name;
              break;
            }
          }

          // If user specified specific Granollers neighborhoods, filter by them
          const specificGrLocs = filters.locations?.filter(l => l.startsWith('gr_')) || [];
          if (specificGrLocs.length > 0 && !filters.locations?.includes('all_granollers')) {
            const allowedNames = specificGrLocs
              .map(l => GRANOLLERS_NEIGHBORHOODS.find(n => `gr_${n.id}` === l)?.name.toLowerCase())
              .filter(Boolean);

            const matchesAny = allowedNames.some(name => fullText.includes(name!));
            if (!matchesAny) {
              continue;
            }
          }
        }

        const slugOrId = item.slugId || String(item.id || item.itemId);
        const fullUrl = `https://es.wallapop.com/item/${slugOrId}`;
        const id = generateListingId('wallapop', String(item.id || item.itemId || slugOrId));

        listings.push({
          id,
          portal: 'wallapop',
          url: fullUrl,
          title,
          description: description.substring(0, 500),
          price,
          currency: 'EUR',
          propertyType: propType,
          operationType: opType,
          town: townName,
          neighborhood,
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
      }
    } catch (e: any) {
      logger.error({ scraper: this.name, error: e.message }, 'Failed parsing Wallapop NEXT_DATA');
    }

    return listings;
  }
}
