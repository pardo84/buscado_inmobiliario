import { getDatabase } from './db.js';
import { SearchRoutine, CreateRoutineInput, RoutineFilters } from '../types/routine.js';

interface RoutineRow {
  id: number;
  user_id: number;
  name: string;
  filters_json: string;
  interval_minutes: number;
  is_active: number;
  last_run_at: string | null;
  last_found_count: number;
  created_at: string;
  updated_at: string;
}

function mapRowToRoutine(row: RoutineRow): SearchRoutine {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    filters: JSON.parse(row.filters_json) as RoutineFilters,
    intervalMinutes: row.interval_minutes,
    isActive: row.is_active === 1,
    lastRunAt: row.last_run_at || undefined,
    lastFoundCount: row.last_found_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const RoutinesRepo = {
  createRoutine(input: CreateRoutineInput): SearchRoutine {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO routines (user_id, name, filters_json, interval_minutes, is_active)
      VALUES (@userId, @name, @filtersJson, @intervalMinutes, 1)
      RETURNING *
    `);

    const row = stmt.get({
      userId: input.userId,
      name: input.name,
      filtersJson: JSON.stringify(input.filters),
      intervalMinutes: input.intervalMinutes,
    }) as RoutineRow;

    return mapRowToRoutine(row);
  },

  getRoutineById(id: number): SearchRoutine | undefined {
    const db = getDatabase();
    const stmt = db.prepare(`SELECT * FROM routines WHERE id = ?`);
    const row = stmt.get(id) as RoutineRow | undefined;
    return row ? mapRowToRoutine(row) : undefined;
  },

  getRoutinesByUser(userId: number): SearchRoutine[] {
    const db = getDatabase();
    const stmt = db.prepare(`SELECT * FROM routines WHERE user_id = ? ORDER BY created_at DESC`);
    const rows = stmt.all(userId) as RoutineRow[];
    return rows.map(mapRowToRoutine);
  },

  getAllActiveRoutines(): SearchRoutine[] {
    const db = getDatabase();
    const stmt = db.prepare(`SELECT * FROM routines WHERE is_active = 1`);
    const rows = stmt.all() as RoutineRow[];
    return rows.map(mapRowToRoutine);
  },

  updateRoutine(
    id: number,
    userId: number,
    updates: Partial<{ name: string; filters: RoutineFilters; intervalMinutes: number; isActive: boolean }>
  ): SearchRoutine | undefined {
    const db = getDatabase();
    const current = this.getRoutineById(id);
    if (!current || current.userId !== userId) return undefined;

    const name = updates.name !== undefined ? updates.name : current.name;
    const filters = updates.filters !== undefined ? updates.filters : current.filters;
    const intervalMinutes = updates.intervalMinutes !== undefined ? updates.intervalMinutes : current.intervalMinutes;
    const isActive = updates.isActive !== undefined ? (updates.isActive ? 1 : 0) : (current.isActive ? 1 : 0);

    const stmt = db.prepare(`
      UPDATE routines
      SET name = @name,
          filters_json = @filtersJson,
          interval_minutes = @intervalMinutes,
          is_active = @isActive,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id AND user_id = @userId
      RETURNING *
    `);

    const row = stmt.get({
      id,
      userId,
      name,
      filtersJson: JSON.stringify(filters),
      intervalMinutes,
      isActive,
    }) as RoutineRow | undefined;

    return row ? mapRowToRoutine(row) : undefined;
  },

  toggleRoutineActive(id: number, userId: number): SearchRoutine | undefined {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE routines 
      SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
      RETURNING *
    `);
    const row = stmt.get(id, userId) as RoutineRow | undefined;
    return row ? mapRowToRoutine(row) : undefined;
  },

  updateRoutineInterval(id: number, userId: number, intervalMinutes: number): SearchRoutine | undefined {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE routines 
      SET interval_minutes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
      RETURNING *
    `);
    const row = stmt.get(intervalMinutes, id, userId) as RoutineRow | undefined;
    return row ? mapRowToRoutine(row) : undefined;
  },

  updateRoutineLastRun(id: number, foundCount: number): void {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE routines 
      SET last_run_at = CURRENT_TIMESTAMP,
          last_found_count = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(foundCount, id);
  },

  deleteRoutine(id: number, userId: number): boolean {
    const db = getDatabase();
    const stmt = db.prepare(`DELETE FROM routines WHERE id = ? AND user_id = ?`);
    const res = stmt.run(id, userId);
    return res.changes > 0;
  },

  countRoutinesByUser(userId: number): number {
    const db = getDatabase();
    const stmt = db.prepare(`SELECT COUNT(*) as count FROM routines WHERE user_id = ?`);
    const res = stmt.get(userId) as { count: number };
    return res.count;
  },
};
