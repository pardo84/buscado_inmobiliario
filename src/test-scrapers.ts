import { scraperService } from './scrapers/index.js';
import { PropertyType, OperationType } from './types/listing.js';
import { logger } from './utils/logger.js';

async function testScrapers() {
  logger.info('Testing live scraping for casas in Granollers and Cardedeu across ALL portals (including Wallapop)...');

  const listings = await scraperService.executeSearch({
    propertyTypes: [PropertyType.CASA],
    operationType: OperationType.VENTA,
    locations: ['all_granollers', 'cardedeu'],
  });

  logger.info({ totalFound: listings.length }, 'Search results summary');

  // Breakdown by portal
  const portalCounts: Record<string, number> = {};
  for (const l of listings) {
    portalCounts[l.portal] = (portalCounts[l.portal] || 0) + 1;
  }
  console.log('\n📊 Inmuebles encontrados por portal:', portalCounts);

  if (listings.length > 0) {
    logger.info('Sample listings:');
    listings.slice(0, 5).forEach((item, idx) => {
      console.log(`\n--- [${idx + 1}] ---`);
      console.log(`Título: ${item.title}`);
      console.log(`Precio: ${item.price} €`);
      console.log(`Inmobiliaria / Vendedor: ${item.agency || 'Particular / Directo'}`);
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
