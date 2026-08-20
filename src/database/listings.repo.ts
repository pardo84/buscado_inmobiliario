import { getDatabase } from './db.js';
import { PropertyListing, ListingStatus, OperationType, PropertyType } from '../types/listing.js';

interface ListingRow {
  id: string;
  portal: string;
  portal_id: string | null;
  url: string;
  title: string;
  price: number;
  previous_price: number | null;
  currency: string;
  price_per_sqm: number | null;
  property_type: string;
  operation_type: string;
  town: string;
  neighborhood: string | null;
  address: string | null;
  rooms: number | null;
  bathrooms: number | null;
  sqm: number | null;
  features_json: string | null;
  description: string | null;
  photos_json: string | null;
  agency: string | null;
  is_bank_property: number;
  published_at: string | null;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
}

function mapRowToListing(row: ListingRow): PropertyListing {
  return {
    id: row.id,
    portal: row.portal,
    portalId: row.portal_id || undefined,
    url: row.url,
    title: row.title,
    price: row.price,
    previousPrice: row.previous_price || undefined,
    currency: row.currency || 'EUR',
    pricePerSqm: row.price_per_sqm || undefined,
    propertyType: row.property_type as PropertyType,
    operationType: row.operation_type as OperationType,
    town: row.town,
    neighborhood: row.neighborhood || undefined,
    address: row.address || undefined,
    rooms: row.rooms ?? undefined,
    bathrooms: row.bathrooms ?? undefined,
    sqm: row.sqm ?? undefined,
    features: row.features_json ? JSON.parse(row.features_json) : [],
    description: row.description || undefined,
    photos: row.photos_json ? JSON.parse(row.photos_json) : [],
    agency: row.agency || undefined,
    isBankProperty: row.is_bank_property === 1,
    publishedAt: row.published_at || undefined,
    status: row.status as ListingStatus,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  };
}

export const ListingsRepo = {
  upsertListing(listing: PropertyListing): { isNew: boolean; priceChanged: boolean; oldPrice?: number } {
    const db = getDatabase();

    const existing = db.prepare(`SELECT id, price, status FROM listings WHERE id = ?`).get(listing.id) as
      | { id: string; price: number; status: string }
      | undefined;

    if (!existing) {
      const stmt = db.prepare(`
        INSERT INTO listings (
          id, portal, portal_id, url, title, price, previous_price, currency, price_per_sqm,
          property_type, operation_type, town, neighborhood, address, rooms, bathrooms,
          sqm, features_json, description, photos_json, agency, is_bank_property, published_at,
          status, first_seen_at, last_seen_at
        ) VALUES (
          @id, @portal, @portalId, @url, @title, @price, NULL, @currency, @pricePerSqm,
          @propertyType, @operationType, @town, @neighborhood, @address, @rooms, @bathrooms,
          @sqm, @featuresJson, @description, @photosJson, @agency, @isBankProperty, @publishedAt,
          @status, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `);

      stmt.run({
        id: listing.id,
        portal: listing.portal,
        portalId: listing.portalId || null,
        url: listing.url,
        title: listing.title,
        price: listing.price,
        currency: listing.currency || 'EUR',
        pricePerSqm: listing.pricePerSqm || null,
        propertyType: listing.propertyType,
        operationType: listing.operationType,
        town: listing.town,
        neighborhood: listing.neighborhood || null,
        address: listing.address || null,
        rooms: listing.rooms ?? null,
        bathrooms: listing.bathrooms ?? null,
        sqm: listing.sqm ?? null,
        featuresJson: JSON.stringify(listing.features || []),
        description: listing.description || null,
        photosJson: JSON.stringify(listing.photos || []),
        agency: listing.agency || null,
        isBankProperty: listing.isBankProperty ? 1 : 0,
        publishedAt: listing.publishedAt || null,
        status: listing.status || 'active',
      });

      // Add snapshot
      db.prepare(`INSERT INTO listing_snapshots (listing_id, price, status) VALUES (?, ?, ?)`).run(
        listing.id,
        listing.price,
        listing.status || 'active'
      );

      return { isNew: true, priceChanged: false };
    }

    const priceChanged = existing.price !== listing.price;
    const oldPrice = existing.price;

    const updateStmt = db.prepare(`
      UPDATE listings SET
        title = @title,
        price = @price,
        previous_price = CASE WHEN @price != price THEN price ELSE previous_price END,
        price_per_sqm = @pricePerSqm,
        rooms = COALESCE(@rooms, rooms),
        bathrooms = COALESCE(@bathrooms, bathrooms),
        sqm = COALESCE(@sqm, sqm),
        features_json = @featuresJson,
        photos_json = CASE WHEN length(@photosJson) > 5 THEN @photosJson ELSE photos_json END,
        status = @status,
        last_seen_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `);

    updateStmt.run({
      id: listing.id,
      title: listing.title,
      price: listing.price,
      pricePerSqm: listing.pricePerSqm || null,
      rooms: listing.rooms ?? null,
      bathrooms: listing.bathrooms ?? null,
      sqm: listing.sqm ?? null,
      featuresJson: JSON.stringify(listing.features || []),
      photosJson: JSON.stringify(listing.photos || []),
      status: listing.status || 'active',
    });

    if (priceChanged) {
      db.prepare(`INSERT INTO listing_snapshots (listing_id, price, status) VALUES (?, ?, ?)`).run(
        listing.id,
        listing.price,
        listing.status || 'active'
      );
    }

    return { isNew: false, priceChanged, oldPrice };
  },

  getListingById(id: string): PropertyListing | undefined {
    const db = getDatabase();
    const row = db.prepare(`SELECT * FROM listings WHERE id = ?`).get(id) as ListingRow | undefined;
    return row ? mapRowToListing(row) : undefined;
  },

  getListingByUrl(url: string): PropertyListing | undefined {
    const db = getDatabase();
    const row = db.prepare(`SELECT * FROM listings WHERE url = ?`).get(url) as ListingRow | undefined;
    return row ? mapRowToListing(row) : undefined;
  },

  hasUserBeenNotified(userId: number, listingId: string): boolean {
    const db = getDatabase();
    const res = db
      .prepare(`SELECT 1 FROM notification_logs WHERE user_id = ? AND listing_id = ? LIMIT 1`)
      .get(userId, listingId);
    return !!res;
  },

  logNotification(userId: number, routineId: number | undefined, listingId: string, type: string, price: number): void {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO notification_logs (user_id, routine_id, listing_id, notification_type, sent_price)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, routineId || null, listingId, type, price);
  },

  updateListingStatus(listingId: string, status: ListingStatus, newPrice?: number): void {
    const db = getDatabase();
    if (newPrice !== undefined) {
      db.prepare(`
        UPDATE listings 
        SET status = ?, price = ?, previous_price = price, last_seen_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(status, newPrice, listingId);
      db.prepare(`INSERT INTO listing_snapshots (listing_id, price, status) VALUES (?, ?, ?)`).run(
        listingId,
        newPrice,
        status
      );
    } else {
      db.prepare(`UPDATE listings SET status = ?, last_seen_at = CURRENT_TIMESTAMP WHERE id = ?`).run(
        status,
        listingId
      );
      db.prepare(
        `INSERT INTO listing_snapshots (listing_id, price, status) 
         SELECT id, price, ? FROM listings WHERE id = ?`
      ).run(status, listingId);
    }
  },

  // Ignored / Disliked listings
  ignoreListing(userId: number, listingId: string): void {
    const db = getDatabase();
    db.prepare(`
      INSERT OR IGNORE INTO ignored_listings (user_id, listing_id, created_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).run(userId, listingId);
  },

  unignoreListing(userId: number, listingId: string): void {
    const db = getDatabase();
    db.prepare(`DELETE FROM ignored_listings WHERE user_id = ? AND listing_id = ?`).run(userId, listingId);
  },

  isListingIgnored(userId: number, listingId: string): boolean {
    const db = getDatabase();
    const res = db
      .prepare(`SELECT 1 FROM ignored_listings WHERE user_id = ? AND listing_id = ? LIMIT 1`)
      .get(userId, listingId);
    return !!res;
  },

  getIgnoredListingIds(userId: number): Set<string> {
    const db = getDatabase();
    const rows = db.prepare(`SELECT listing_id FROM ignored_listings WHERE user_id = ?`).all(userId) as {
      listing_id: string;
    }[];
    return new Set(rows.map(r => r.listing_id));
  },
};
