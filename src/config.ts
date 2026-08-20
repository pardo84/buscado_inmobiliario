import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const CONFIG = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  ADMIN_USER_IDS: (process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)
    .map(Number),
  DB_PATH: process.env.DB_PATH || path.resolve(process.cwd(), 'data', 'database.sqlite'),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  DEFAULT_CHECK_INTERVAL_MINUTES: Number(process.env.DEFAULT_CHECK_INTERVAL_MINUTES || 30),
  TRACKING_CHECK_INTERVAL_MINUTES: Number(process.env.TRACKING_CHECK_INTERVAL_MINUTES || 60),
  SCRAPER_TIMEOUT_MS: Number(process.env.SCRAPER_TIMEOUT_MS || 15000),
  USER_AGENT:
    process.env.USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};
