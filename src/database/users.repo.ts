import { getDatabase } from './db.js';

export interface UserRecord {
  telegram_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  is_admin: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export const UsersRepo = {
  upsertUser(user: {
    telegramId: number;
    username?: string;
    firstName?: string;
    lastName?: string;
    isAdmin?: boolean;
  }): UserRecord {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO users (telegram_id, username, first_name, last_name, is_admin, is_active, updated_at)
      VALUES (@telegramId, @username, @firstName, @lastName, @isAdmin, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(telegram_id) DO UPDATE SET
        username = excluded.username,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        is_active = 1,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `);

    return stmt.get({
      telegramId: user.telegramId,
      username: user.username || null,
      firstName: user.firstName || null,
      lastName: user.lastName || null,
      isAdmin: user.isAdmin ? 1 : 0,
    }) as UserRecord;
  },

  getUser(telegramId: number): UserRecord | undefined {
    const db = getDatabase();
    const stmt = db.prepare(`SELECT * FROM users WHERE telegram_id = ?`);
    return stmt.get(telegramId) as UserRecord | undefined;
  },

  getAllActiveUsers(): UserRecord[] {
    const db = getDatabase();
    const stmt = db.prepare(`SELECT * FROM users WHERE is_active = 1`);
    return stmt.all() as UserRecord[];
  },
};
