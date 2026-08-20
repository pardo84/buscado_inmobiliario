import { getDatabase } from './db.js';
import { TrackedListing, ListingStatus } from '../types/listing.js';

interface TrackedRow {
  id: number;
  user_id: number;
  listing_id: string;
  url: string;
  portal: string;
  title: string;
  initial_price: number;
  current_price: number;
  property_type: string;
  town: string;
  neighborhood: string | null;
  photo_url: string | null;
  status: string;
  is_active: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  last_checked_at: string;
}

function mapRowToTracked(row: TrackedRow): TrackedListing {
  return {
    id: row.id,
    userId: row.user_id,
    listingId: row.listing_id,
    url: row.url,
    portal: row.portal,
    title: row.title,
    initialPrice: row.initial_price,
    currentPrice: row.current_price,
    propertyType: row.property_type,
    town: row.town,
    neighborhood: row.neighborhood || undefined,
    photoUrl: row.photo_url || undefined,
    status: row.status as ListingStatus,
    isActive: row.is_active === 1,
    notes: row.notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastCheckedAt: row.last_checked_at,
  };
}

export const TrackingRepo = {
  addTrackedListing(item: {
    userId: number;
    listingId: string;
    url: string;
    portal: string;
    title: string;
    price: number;
    propertyType?: string;
    town?: string;
    neighborhood?: string;
    photoUrl?: string;
    notes?: string;
  }): { tracked: TrackedListing; isNew: boolean } {
    const db = getDatabase();

    const existing = db
      .prepare(`SELECT * FROM tracked_listings WHERE user_id = ? AND listing_id = ?`)
      .get(item.userId, item.listingId) as TrackedRow | undefined;

    if (existing) {
      // Reactivate if was paused/deleted
      if (existing.is_active === 0) {
        db.prepare(`UPDATE tracked_listings SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(
          existing.id
        );
      }
      return {
        tracked: mapRowToTracked(existing),
        isNew: false,
      };
    }

    const stmt = db.prepare(`
      INSERT INTO tracked_listings (
        user_id, listing_id, url, portal, title, initial_price, current_price,
        property_type, town, neighborhood, photo_url, status, is_active, notes
      ) VALUES (
        @userId, @listingId, @url, @portal, @title, @price, @price,
        @propertyType, @town, @neighborhood, @photoUrl, 'active', 1, @notes
      )
      RETURNING *
    `);

    const row = stmt.get({
      userId: item.userId,
      listingId: item.listingId,
      url: item.url,
      portal: item.portal,
      title: item.title,
      price: item.price,
      propertyType: item.propertyType || 'piso',
      town: item.town || 'Granollers',
      neighborhood: item.neighborhood || null,
      photoUrl: item.photoUrl || null,
      notes: item.notes || null,
    }) as TrackedRow;

    return {
      tracked: mapRowToTracked(row),
      isNew: true,
    };
  },

  getTrackedByUser(userId: number): TrackedListing[] {
    const db = getDatabase();
    const rows = db
      .prepare(`SELECT * FROM tracked_listings WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC`)
      .all(userId) as TrackedRow[];
    return rows.map(mapRowToTracked);
  },

  getAllActiveTracked(): TrackedListing[] {
    const db = getDatabase();
    const rows = db
      .prepare(`SELECT * FROM tracked_listings WHERE is_active = 1 ORDER BY last_checked_at ASC`)
      .all() as TrackedRow[];
    return rows.map(mapRowToTracked);
  },

  updateTrackedStatus(
    id: number,
    status: ListingStatus,
    newPrice?: number
  ): { priceChanged: boolean; oldPrice: number; currentPrice: number } {
    const db = getDatabase();
    const current = db.prepare(`SELECT * FROM tracked_listings WHERE id = ?`).get(id) as TrackedRow | undefined;
    if (!current) {
      return { priceChanged: false, oldPrice: 0, currentPrice: 0 };
    }

    const price = newPrice !== undefined ? newPrice : current.current_price;
    const priceChanged = price !== current.current_price;

    db.prepare(`
      UPDATE tracked_listings 
      SET status = ?, current_price = ?, last_checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, price, id);

    return {
      priceChanged,
      oldPrice: current.current_price,
      currentPrice: price,
    };
  },

  removeTracked(userId: number, listingId: string): boolean {
    const db = getDatabase();
    const res = db.prepare(`DELETE FROM tracked_listings WHERE user_id = ? AND listing_id = ?`).run(userId, listingId);
    return res.changes > 0;
  },

  isTracked(userId: number, listingId: string): boolean {
    const db = getDatabase();
    const res = db
      .prepare(`SELECT 1 FROM tracked_listings WHERE user_id = ? AND listing_id = ? AND is_active = 1`)
      .get(userId, listingId);
    return !!res;
  },
};
