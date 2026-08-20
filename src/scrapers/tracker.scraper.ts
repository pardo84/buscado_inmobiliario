import * as cheerio from 'cheerio';
import axios from 'axios';
import { BaseScraper, getRandomUserAgent } from './base.scraper.js';
import { ListingStatus } from '../types/listing.js';
import { parsePrice } from '../utils/text.js';
import { logger } from '../utils/logger.js';

export interface TrackedCheckResult {
  url: string;
  isAvailable: boolean;
  status: ListingStatus;
  currentPrice: number;
  title?: string;
  photoUrl?: string;
  errorMessage?: string;
}

export class TrackerScraper {
  async checkListing(url: string): Promise<TrackedCheckResult> {
    try {
      const response = await axios.get<string>(url, {
        timeout: 15000,
        validateStatus: status => status < 500, // Handle 404s cleanly
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept-Language': 'es-ES,es;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (response.status === 404 || response.status === 410) {
        return {
          url,
          isAvailable: false,
          status: ListingStatus.REMOVED,
          currentPrice: 0,
        };
      }

      const html = response.data;
      const $ = cheerio.load(html);

      const htmlLower = html.toLowerCase();
      const pageText = $('body').text().toLowerCase();

      // Check if listing has been deactivated/sold/reserved
      if (
        pageText.includes('inmueble no disponible') ||
        pageText.includes('anuncio no disponible') ||
        pageText.includes('anuncio dado de baja') ||
        pageText.includes('ya no está disponible') ||
        pageText.includes('anuncio desactivado') ||
        pageText.includes('ha sido retirado')
      ) {
        return {
          url,
          isAvailable: false,
          status: ListingStatus.REMOVED,
          currentPrice: 0,
        };
      }

      if (pageText.includes('inmueble reservado') || pageText.includes('reservado')) {
        // Double check it's a status label
        const isReserved = $('.reserved, .tag-reserved, .badge-reserved, span:contains("Reservado")').length > 0;
        if (isReserved) {
          const priceText = $(
            '.price, .font-2, .re-DetailHeader-price, [itemprop="price"], .jsPrice, .h1-price'
          ).first().text().trim();
          const currentPrice = parsePrice(priceText);
          return {
            url,
            isAvailable: true,
            status: ListingStatus.RESERVED,
            currentPrice,
          };
        }
      }

      if (pageText.includes('vendido') && $('.sold, .tag-sold, span:contains("Vendido")').length > 0) {
        return {
          url,
          isAvailable: false,
          status: ListingStatus.SOLD,
          currentPrice: 0,
        };
      }

      // Extract price
      const priceText = $(
        '.price, .font-2, .re-DetailHeader-price, [itemprop="price"], .jsPrice, .heading-1, .price-box span'
      ).first().text().trim();

      const currentPrice = parsePrice(priceText);

      // Extract Title
      const title = $('h1, .detail-title, meta[property="og:title"]').first().text().trim() ||
        $('meta[property="og:title"]').attr('content') ||
        $('title').text().trim();

      // Extract Photo
      const photoUrl = $('meta[property="og:image"]').attr('content') ||
        $('.gallery img, .slider img, img.main-photo').first().attr('src');

      return {
        url,
        isAvailable: true,
        status: ListingStatus.ACTIVE,
        currentPrice: currentPrice > 0 ? currentPrice : 0,
        title,
        photoUrl: photoUrl && !photoUrl.includes('data:') ? photoUrl : undefined,
      };
    } catch (err: any) {
      logger.warn({ url, error: err.message }, 'Failed to check tracked listing');
      return {
        url,
        isAvailable: true,
        status: ListingStatus.UNKNOWN,
        currentPrice: 0,
        errorMessage: err.message,
      };
    }
  }
}
