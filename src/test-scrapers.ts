import { scraperService } from './scrapers/index.js';
import { PropertyType, OperationType } from './types/listing.js';
import { logger } from './utils/logger.js';

async function testScrapers() {
  logger.info('Testing live scraping for casas in Palou & Can Bassa...');

  const listings = await scraperService.executeSearch({
    propertyTypes: [PropertyType.CASA],
    operationType: OperationType.VENTA,
    locations: ['gr_palou', 'gr_can_bassa'],
  });

  logger.info({ totalFound: listings.length }, 'Search results summary');

  if (listings.length > 0) {
    logger.info('First 3 listings:');
    listings.slice(0, 3).forEach((item, idx) => {
      console.log(`\n--- [${idx + 1}] ---`);
      console.log(`Título: ${item.title}`);
      console.log(`Precio: ${item.price} €`);
      console.log(`Inmobiliaria: ${item.agency || 'Particular / Directo'}`);
      console.log(`Municipio: ${item.town} | Barrio: ${item.neighborhood || 'N/A'}`);
      console.log(`Habs: ${item.rooms || '?'} | Baños: ${item.bathrooms || '?'} | m²: ${item.sqm || '?'}`);
      console.log(`Portal: ${item.portal} | Banco: ${item.isBankProperty ? 'Sí' : 'No'}`);
      console.log(`URL: ${item.url}`);
    });
  } else {
    logger.warn('No listings parsed in live test (may be due to rate limit or selector update)');
  }
}

testScrapers().catch(err => {
  logger.error(err, 'Live scraper test error');
});
