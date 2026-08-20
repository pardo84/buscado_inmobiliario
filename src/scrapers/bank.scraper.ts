import * as cheerio from 'cheerio';
import { BaseScraper } from './base.scraper.js';
import { PropertyListing, PropertyType, OperationType, ListingStatus } from '../types/listing.js';
import { RoutineFilters } from '../types/routine.js';
import { Town } from '../types/locations.js';
import { parsePrice, parseRooms, parseBathrooms, parseSqm, generateListingId, isBankEntity } from '../utils/text.js';
import { logger } from '../utils/logger.js';

export class BankScraper extends BaseScraper {
  name = 'bank_properties';
  private baseUrl = 'https://www.pisos.com';

  private bankTownSlugs: { town: Town; slug: string; locationKey: string }[] = [
    { town: Town.GRANOLLERS, slug: 'granollers', locationKey: 'all_granollers' },
    { town: Town.CARDEDEU, slug: 'cardedeu', locationKey: 'cardedeu' },
    { town: Town.LA_ROCA, slug: 'la_roca_del_valles', locationKey: 'la_roca' },
    { town: Town.LES_FRANQUESES, slug: 'les_franqueses_del_valles', locationKey: 'les_franqueses' },
  ];

  async search(filters: RoutineFilters): Promise<PropertyListing[]> {
    // Only run if user specifically wants bank properties or if explicitly enabled
    if (filters.excludeBankProperties) {
      return [];
    }

    const listings: PropertyListing[] = [];
    const locations = filters.locations || ['all_granollers'];

    for (const item of this.bankTownSlugs) {
      const match =
        locations.includes(item.locationKey) ||
        (item.town === Town.GRANOLLERS && locations.some(l => l.startsWith('gr_')));

      if (!match) continue;

      try {
        const url = `${this.baseUrl}/venta/inmuebles_bancos-${item.slug}/`;
        const html = await this.fetchHtml(url);
        const parsed = this.parseBankHtml(html, item.town, filters);
        listings.push(...parsed);
      } catch (err: any) {
        // Skip
      }
    }

    const unique = new Map<string, PropertyListing>();
    for (const l of listings) {
      if (!unique.has(l.url)) {
        unique.set(l.url, l);
      }
    }

    return Array.from(unique.values());
  }

  private parseBankHtml(html: string, town: Town, filters: RoutineFilters): PropertyListing[] {
    const $ = cheerio.load(html);
    const results: PropertyListing[] = [];

    $('.ad-preview, .grid-item, article').each((_, el) => {
      try {
        const card = $(el);
        const link = card.find('a[href*="/comprar/"], a[href*="/venta/"], a.ad-preview__title').first();
        let href = link.attr('href') || card.attr('data-navigate-url');

        if (!href) return;
        if (href.includes('javascript:') || href.startsWith('#')) return;

        const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;
        let title = link.text().trim() || card.find('h3, .title, .ad-preview__title').first().text().trim();

        const agency = card.find('.ad-preview__agency, .agency-logo, .logo-inmobiliaria, .agency-name').text().trim() || undefined;

        // Verify it really is a bank entity
        const isBank = isBankEntity(agency, title, card.text());
        if (!isBank && filters.bankPropertiesOnly) return;

        const priceText = card.find('.ad-preview__price, .price, .jsPrice').first().text().trim();
        const price = parsePrice(priceText);
        if (price <= 0) return;

        if (filters.minPrice && price < filters.minPrice) return;
        if (filters.maxPrice && price > filters.maxPrice) return;

        const charText = card.find('.ad-preview__characteristics, .characteristics, .item-details').text();
        const rooms = parseRooms(charText);
        const bathrooms = parseBathrooms(charText);
        const sqm = parseSqm(charText);

        const imgEl = card.find('img').first();
        const img = imgEl.attr('src') || imgEl.attr('data-src');
        const photos = img && !img.includes('data:image') && !img.includes('spacer') ? [img] : [];

        const id = generateListingId('pisos', fullUrl);
        results.push({
          id,
          portal: 'pisos.com',
          url: fullUrl,
          title: title || `Inmueble en ${town}`,
          price,
          currency: 'EUR',
          pricePerSqm: sqm ? Math.round(price / sqm) : undefined,
          propertyType: PropertyType.PISO,
          operationType: OperationType.VENTA,
          town,
          rooms,
          bathrooms,
          sqm,
          features: isBank ? ['inmueble_banco'] : [],
          photos,
          agency: agency || (isBank ? 'Activo Bancario / Servicer' : undefined),
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
