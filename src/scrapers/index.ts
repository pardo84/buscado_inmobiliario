import { HabitacliaScraper } from './habitaclia.scraper.js';
import { FotocasaScraper } from './fotocasa.scraper.js';
import { PisosScraper } from './pisos.scraper.js';
import { BankScraper } from './bank.scraper.js';
import { TrackerScraper } from './tracker.scraper.js';
import { PropertyListing } from '../types/listing.js';
import { RoutineFilters } from '../types/routine.js';
import { logger } from '../utils/logger.js';

export class ScraperOrchestrator {
  private habitaclia = new HabitacliaScraper();
  private fotocasa = new FotocasaScraper();
  private pisos = new PisosScraper();
  private bank = new BankScraper();
  public tracker = new TrackerScraper();

  async executeSearch(filters: RoutineFilters): Promise<PropertyListing[]> {
    logger.info({ filters }, 'Starting multi-portal search');

    const tasks: Promise<PropertyListing[]>[] = [];

    // Habitaclia (Primary & most complete for Granollers / Vallès Oriental)
    if (!filters.portals || filters.portals.includes('habitaclia') || filters.portals.length === 0) {
      tasks.push(this.habitaclia.search(filters));
    }

    // Bank repossessions & servicers
    if (filters.bankPropertiesOnly || !filters.excludeBankProperties) {
      tasks.push(this.bank.search(filters));
    }

    // Fotocasa
    if (!filters.bankPropertiesOnly && (!filters.portals || filters.portals.includes('fotocasa'))) {
      tasks.push(this.fotocasa.search(filters));
    }

    // Pisos.com
    if (!filters.bankPropertiesOnly && (!filters.portals || filters.portals.includes('pisos'))) {
      tasks.push(this.pisos.search(filters));
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

    // Deduplicate by URL or normalized Title + Price
    const unique = new Map<string, PropertyListing>();
    for (const listing of allListings) {
      const key = listing.url;
      if (!unique.has(key)) {
        unique.set(key, listing);
      }
    }

    const result = Array.from(unique.values());
    logger.info({ count: result.length }, 'Completed multi-portal search');
    return result;
  }
}

export const scraperService = new ScraperOrchestrator();
