import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { PropertyListing } from '../types/listing.js';
import { RoutineFilters } from '../types/routine.js';
import { CONFIG } from '../config.js';
import { logger } from '../utils/logger.js';

export interface IScraper {
  name: string;
  search(filters: RoutineFilters): Promise<PropertyListing[]>;
}

export const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
];

export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export abstract class BaseScraper implements IScraper {
  abstract name: string;
  protected client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      timeout: CONFIG.SCRAPER_TIMEOUT_MS,
      headers: {
        'Accept-Language': 'es-ES,es;q=0.9,ca;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
    });
  }

  protected async fetchHtml(url: string, config?: AxiosRequestConfig): Promise<string> {
    try {
      const response = await this.client.get<string>(url, {
        ...config,
        headers: {
          ...config?.headers,
          'User-Agent': getRandomUserAgent(),
        },
      });
      return response.data;
    } catch (error: any) {
      logger.warn({ scraper: this.name, url, error: error.message }, 'Scraper fetchHtml failed');
      throw error;
    }
  }

  abstract search(filters: RoutineFilters): Promise<PropertyListing[]>;
}
