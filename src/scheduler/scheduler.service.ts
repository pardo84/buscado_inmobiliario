import cron, { ScheduledTask } from 'node-cron';
import { Bot } from 'grammy';
import { BotContext } from '../bot/context.js';
import { RoutinesRepo } from '../database/routines.repo.js';
import { ListingsRepo } from '../database/listings.repo.js';
import { TrackingRepo } from '../database/tracking.repo.js';
import { scraperService } from '../scrapers/index.js';
import { MessageFormatter } from '../bot/formatters/message.formatter.js';
import { ListingStatus } from '../types/listing.js';
import { logger } from '../utils/logger.js';

export class SchedulerService {
  private isRoutineRunning = false;
  private isTrackingRunning = false;
  private routineTask: ScheduledTask | null = null;
  private trackingTask: ScheduledTask | null = null;

  start(bot: Bot<BotContext>): void {
    logger.info('Starting background scheduler service for routines and tracking...');

    // Run every minute to check if any routine is due
    this.routineTask = cron.schedule('* * * * *', async () => {
      await this.checkAndRunRoutines(bot);
    });

    // Run tracking checks every 30 minutes
    this.trackingTask = cron.schedule('*/30 * * * *', async () => {
      await this.checkTrackedListings(bot);
    });

    logger.info('Scheduler jobs registered successfully (Routines: every 1m check, Tracking: every 30m).');
  }

  stop(): void {
    this.routineTask?.stop();
    this.trackingTask?.stop();
    logger.info('Scheduler stopped.');
  }

  async checkAndRunRoutines(bot: Bot<BotContext>): Promise<void> {
    if (this.isRoutineRunning) return;
    this.isRoutineRunning = true;

    try {
      const activeRoutines = RoutinesRepo.getAllActiveRoutines();
      const now = Date.now();

      for (const routine of activeRoutines) {
        let isDue = false;
        if (!routine.lastRunAt) {
          isDue = true;
        } else {
          const lastRunTime = new Date(routine.lastRunAt).getTime();
          const diffMinutes = (now - lastRunTime) / (1000 * 60);
          if (diffMinutes >= routine.intervalMinutes) {
            isDue = true;
          }
        }

        if (!isDue) continue;

        logger.info({ routineId: routine.id, routineName: routine.name }, 'Executing scheduled routine');

        try {
          const listings = await scraperService.executeSearch(routine.filters);
          RoutinesRepo.updateRoutineLastRun(routine.id, listings.length);

          const ignored = ListingsRepo.getIgnoredListingIds(routine.userId);
          let newNotifiedCount = 0;

          for (const item of listings) {
            // Upsert in database
            ListingsRepo.upsertListing(item);

            // Skip if ignored/disliked by user
            if (ignored.has(item.id)) {
              continue;
            }

            // Check if user was already notified
            const alreadyNotified = ListingsRepo.hasUserBeenNotified(routine.userId, item.id);

            if (!alreadyNotified) {
              const { text, reply_markup } = MessageFormatter.formatListing(item, routine.name);

              try {
                if (item.photos && item.photos.length > 0) {
                  await bot.api.sendPhoto(routine.userId, item.photos[0], {
                    caption: text,
                    parse_mode: 'HTML',
                    reply_markup,
                  });
                } else {
                  await bot.api.sendMessage(routine.userId, text, {
                    parse_mode: 'HTML',
                    reply_markup,
                  });
                }

                ListingsRepo.logNotification(routine.userId, routine.id, item.id, 'new_listing', item.price);
                newNotifiedCount++;

                // Small delay to avoid rate-limiting
                await new Promise(r => setTimeout(r, 400));
              } catch (sendErr: any) {
                logger.warn(
                  { userId: routine.userId, listingId: item.id, error: sendErr.message },
                  'Failed to send Telegram notification'
                );
              }
            }
          }

          logger.info(
            { routineId: routine.id, totalFound: listings.length, newAlertsSent: newNotifiedCount },
            'Routine run completed'
          );
        } catch (err: any) {
          logger.error({ routineId: routine.id, error: err.message }, 'Error running search routine');
        }
      }
    } finally {
      this.isRoutineRunning = false;
    }
  }

  async checkTrackedListings(bot: Bot<BotContext>): Promise<void> {
    if (this.isTrackingRunning) return;
    this.isTrackingRunning = true;

    try {
      const trackedListings = TrackingRepo.getAllActiveTracked();
      logger.info({ count: trackedListings.length }, 'Checking tracked listings for price drops and status updates');

      for (const item of trackedListings) {
        try {
          const check = await scraperService.tracker.checkListing(item.url);

          // Status change check
          if (check.status !== ListingStatus.UNKNOWN && check.status !== item.status) {
            TrackingRepo.updateTrackedStatus(item.id!, check.status, check.currentPrice || item.currentPrice);

            if (check.status === ListingStatus.REMOVED || check.status === ListingStatus.SOLD || check.status === ListingStatus.RESERVED) {
              const { text, reply_markup } = MessageFormatter.formatStatusChange(item, check.status);
              await bot.api.sendMessage(item.userId, text, { parse_mode: 'HTML', reply_markup });
            }
          }

          // Price change check
          if (check.currentPrice > 0 && check.currentPrice !== item.currentPrice) {
            const { priceChanged, oldPrice, currentPrice } = TrackingRepo.updateTrackedStatus(
              item.id!,
              check.status,
              check.currentPrice
            );

            if (priceChanged) {
              const { text, reply_markup } = MessageFormatter.formatPriceDrop(item, oldPrice, currentPrice);
              await bot.api.sendMessage(item.userId, text, { parse_mode: 'HTML', reply_markup });
              ListingsRepo.logNotification(item.userId, undefined, item.listingId, 'price_drop', currentPrice);
            }
          }

          // Small delay between checks
          await new Promise(r => setTimeout(r, 600));
        } catch (err: any) {
          logger.warn({ trackedId: item.id, url: item.url, error: err.message }, 'Failed to check tracked listing');
        }
      }
    } finally {
      this.isTrackingRunning = false;
    }
  }
}

export const schedulerService = new SchedulerService();
