import { getDatabase, closeDatabase } from './database/db.js';
import { UsersRepo } from './database/users.repo.js';
import { RoutinesRepo } from './database/routines.repo.js';
import { ListingsRepo } from './database/listings.repo.js';
import { TrackingRepo } from './database/tracking.repo.js';
import { PropertyType, OperationType, ListingStatus } from './types/listing.js';
import { logger } from './utils/logger.js';

async function testDatabase() {
  logger.info('Testing database initialization and repositories...');
  getDatabase();

  // Test User
  const user = UsersRepo.upsertUser({
    telegramId: 12345678,
    username: 'alex_test',
    firstName: 'Alex',
    lastName: 'P',
    isAdmin: true,
  });
  logger.info({ user }, 'User upserted');

  // Test Routine
  const routine = RoutinesRepo.createRoutine({
    userId: 12345678,
    name: 'Pisos Granollers Centre < 200k',
    filters: {
      propertyTypes: [PropertyType.PISO],
      operationType: OperationType.VENTA,
      locations: ['gr_centre'],
      maxPrice: 200000,
      minRooms: 2,
      mustHaveElevator: true,
    },
    intervalMinutes: 30,
  });
  logger.info({ routine }, 'Routine created');

  // Test Listing
  const listingId = 'habitaclia_test123';
  const listingRes = ListingsRepo.upsertListing({
    id: listingId,
    portal: 'habitaclia',
    url: 'https://www.habitaclia.com/comprar-piso-granollers-centre-123.htm',
    title: 'Piso luminoso en Granollers Centro con ascensor',
    price: 185000,
    currency: 'EUR',
    propertyType: PropertyType.PISO,
    operationType: OperationType.VENTA,
    town: 'Granollers',
    neighborhood: 'Centre',
    rooms: 3,
    bathrooms: 1,
    sqm: 85,
    features: ['ascensor', 'balcon'],
    photos: ['https://example.com/photo.jpg'],
    agency: 'Finques Granollers',
    isBankProperty: false,
    status: ListingStatus.ACTIVE,
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  });
  logger.info({ listingRes }, 'Listing upserted');

  // Test Tracking
  const trackingRes = TrackingRepo.addTrackedListing({
    userId: 12345678,
    listingId,
    url: 'https://www.habitaclia.com/comprar-piso-granollers-centre-123.htm',
    portal: 'habitaclia',
    title: 'Piso luminoso en Granollers Centro con ascensor',
    price: 185000,
    propertyType: 'piso',
    town: 'Granollers',
    neighborhood: 'Centre',
  });
  logger.info({ trackingRes }, 'Tracking added');

  // Simulate price drop
  const statusUpdate = TrackingRepo.updateTrackedStatus(trackingRes.tracked.id!, ListingStatus.PRICE_DROPPED, 175000);
  logger.info({ statusUpdate }, 'Tracked price updated (simulated drop)');

  closeDatabase();
  logger.info('Database tests passed successfully! ✅');
}

testDatabase().catch(err => {
  logger.error(err, 'Database test error');
  process.exit(1);
});
