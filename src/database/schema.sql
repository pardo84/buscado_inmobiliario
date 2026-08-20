-- Users table
CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    is_admin INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Search routines configured by users
CREATE TABLE IF NOT EXISTS routines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    filters_json TEXT NOT NULL,
    interval_minutes INTEGER DEFAULT 30,
    is_active INTEGER DEFAULT 1,
    last_run_at DATETIME,
    last_found_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

-- Real estate listings repository (cache of discovered properties)
CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,
    portal TEXT NOT NULL,
    portal_id TEXT,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    price INTEGER NOT NULL,
    previous_price INTEGER,
    currency TEXT DEFAULT 'EUR',
    price_per_sqm REAL,
    property_type TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    town TEXT NOT NULL,
    neighborhood TEXT,
    address TEXT,
    rooms INTEGER,
    bathrooms INTEGER,
    sqm REAL,
    features_json TEXT,
    description TEXT,
    photos_json TEXT,
    agency TEXT,
    is_bank_property INTEGER DEFAULT 0,
    published_at DATETIME,
    status TEXT DEFAULT 'active',
    first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Price & status history snapshots
CREATE TABLE IF NOT EXISTS listing_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id TEXT NOT NULL,
    price INTEGER NOT NULL,
    status TEXT NOT NULL,
    checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(listing_id) REFERENCES listings(id) ON DELETE CASCADE
);

-- Listings tracked/favorited by users for price drops / status changes
CREATE TABLE IF NOT EXISTS tracked_listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    listing_id TEXT NOT NULL,
    url TEXT NOT NULL,
    portal TEXT NOT NULL,
    title TEXT NOT NULL,
    initial_price INTEGER NOT NULL,
    current_price INTEGER NOT NULL,
    property_type TEXT,
    town TEXT,
    neighborhood TEXT,
    photo_url TEXT,
    status TEXT DEFAULT 'active',
    is_active INTEGER DEFAULT 1,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, listing_id),
    FOREIGN KEY(user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

-- Notification delivery history (prevents re-notifying the exact same listing if not changed)
CREATE TABLE IF NOT EXISTS notification_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    routine_id INTEGER,
    listing_id TEXT NOT NULL,
    notification_type TEXT NOT NULL, -- 'new_listing', 'price_drop', 'price_increase', 'status_change', 'sold'
    sent_price INTEGER,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(telegram_id) ON DELETE CASCADE,
    FOREIGN KEY(routine_id) REFERENCES routines(id) ON DELETE SET NULL,
    FOREIGN KEY(listing_id) REFERENCES listings(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_routines_user ON routines(user_id);
CREATE INDEX IF NOT EXISTS idx_routines_active ON routines(is_active);
CREATE INDEX IF NOT EXISTS idx_listings_town ON listings(town);
CREATE INDEX IF NOT EXISTS idx_listings_type ON listings(property_type);
CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price);
CREATE INDEX IF NOT EXISTS idx_tracked_user ON tracked_listings(user_id);
CREATE INDEX IF NOT EXISTS idx_tracked_active ON tracked_listings(is_active);
CREATE INDEX IF NOT EXISTS idx_snapshots_listing ON listing_snapshots(listing_id);
CREATE INDEX IF NOT EXISTS idx_notif_user_listing ON notification_logs(user_id, listing_id);
