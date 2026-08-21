import { HabitacliaScraper } from './habitaclia.scraper.js';
import { FotocasaScraper } from './fotocasa.scraper.js';
import { PisosScraper } from './pisos.scraper.js';
import { BankScraper } from './bank.scraper.js';
import { WallapopScraper } from './wallapop.scraper.js';
import { TrackerScraper } from './tracker.scraper.js';
import { PropertyListing, PropertyType } from '../types/listing.js';
import { RoutineFilters } from '../types/routine.js';
import { logger } from '../utils/logger.js';

export class ScraperOrchestrator {
  private habitaclia = new HabitacliaScraper();
  private fotocasa = new FotocasaScraper();
  private pisos = new PisosScraper();
  private bank = new BankScraper();
  private wallapop = new WallapopScraper();
  public tracker = new TrackerScraper();

  async executeSearch(filters: RoutineFilters): Promise<PropertyListing[]> {
    logger.info({ filters }, 'Starting multi-portal search');

    const tasks: Promise<PropertyListing[]>[] = [];

    // Habitaclia (Primary & most complete for Granollers / Vallès Oriental)
    if (!filters.bankPropertiesOnly && (!filters.portals || filters.portals.includes('habitaclia') || filters.portals.length === 0)) {
      tasks.push(this.habitaclia.search(filters));
    }

    // Fotocasa
    if (!filters.bankPropertiesOnly && (!filters.portals || filters.portals.includes('fotocasa') || filters.portals.length === 0)) {
      tasks.push(this.fotocasa.search(filters));
    }

    // Pisos.com
    if (!filters.bankPropertiesOnly && (!filters.portals || filters.portals.includes('pisos') || filters.portals.length === 0)) {
      tasks.push(this.pisos.search(filters));
    }

    // Wallapop (Inmuebles particulares y oportunidades locales)
    if (!filters.bankPropertiesOnly && (!filters.portals || filters.portals.includes('wallapop') || filters.portals.length === 0)) {
      tasks.push(this.wallapop.search(filters));
    }

    // Bank repossessions & servicers
    if (filters.bankPropertiesOnly || !filters.excludeBankProperties) {
      tasks.push(this.bank.search(filters));
    }

    const settled = await Promise.allSettled(tasks);
    const allListings: PropertyListing[] = [];

    for (const res of settled) {
      if (res.status === 'fulfilled') {
        allListings.push(...res.value);
      } else {
        logger.error({ error: res.reason }, 'Scraper task failed');
      }
    }

    // Deduplicate by URL
    const unique = new Map<string, PropertyListing>();
    for (const listing of allListings) {
      const key = listing.url;
      if (!unique.has(key)) {
        unique.set(key, listing);
      }
    }

    // Strict Post-filtering Stage: ensure 100% adherence to all user criteria
    const result = Array.from(unique.values()).filter(item => {
      // 1. Strict Property Type Filter
      if (
        filters.propertyTypes &&
        filters.propertyTypes.length > 0 &&
        !filters.propertyTypes.includes(PropertyType.CUALQUIERA)
      ) {
        if (!filters.propertyTypes.includes(item.propertyType)) {
          return false;
        }
      }

      // 2. Price Filter
      if (filters.minPrice && item.price < filters.minPrice) return false;
      if (filters.maxPrice && item.price > filters.maxPrice) return false;

      // 3. Minimum Rooms
      if (filters.minRooms && item.rooms && item.rooms < filters.minRooms) return false;

      // 4. Minimum Sqm
      if (filters.minSqm && item.sqm && item.sqm < filters.minSqm) return false;

      // 5. Mandatory Features
      if (filters.mustHaveElevator && !item.features.includes('ascensor')) return false;
      if (filters.mustHaveParking && !item.features.includes('parking')) return false;
      if (filters.mustHaveTerrace && !item.features.includes('terraza')) return false;
      if (filters.mustHavePool && !item.features.includes('piscina')) return false;

      // 6. Bank Filter
      if (filters.bankPropertiesOnly && !item.isBankProperty) return false;
      if (filters.excludeBankProperties && item.isBankProperty) return false;

      return true;
    });

    logger.info({ totalFound: result.length }, 'Completed multi-portal search with strict filters');
    return result;
  }
}

export const scraperService = new ScraperOrchestrator();
