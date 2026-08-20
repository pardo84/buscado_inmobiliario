import { BotContext } from '../context.js';
import { RoutinesRepo } from '../../database/routines.repo.js';
import { ListingsRepo } from '../../database/listings.repo.js';
import { TrackingRepo } from '../../database/tracking.repo.js';
import { scraperService } from '../../scrapers/index.js';
import { MessageFormatter } from '../formatters/message.formatter.js';
import { logger } from '../../utils/logger.js';

export async function handleCallbacks(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  const userId = ctx.from?.id;

  if (!data || !userId) return;

  // Track listing: track_<listingId>
  if (data.startsWith('track_')) {
    const listingId = data.replace('track_', '');
    const listing = ListingsRepo.getListingById(listingId);

    if (!listing) {
      await ctx.answerCallbackQuery({ text: 'Inmueble no encontrado en el historial.' });
      return;
    }

    const { tracked, isNew } = TrackingRepo.addTrackedListing({
      userId,
      listingId: listing.id,
      url: listing.url,
      portal: listing.portal,
      title: listing.title,
      price: listing.price,
      propertyType: listing.propertyType,
      town: listing.town,
      neighborhood: listing.neighborhood,
      photoUrl: listing.photos?.[0],
    });

    await ctx.answerCallbackQuery({
      text: isNew
        ? '⭐ ¡Añadido a seguimiento! Te avisaremos si cambia de precio o desaparece.'
        : '⭐ Ya estás siguiendo este inmueble.',
      show_alert: true,
    });
    return;
  }

  // Dislike / Ignore listing: dislike_<listingId>
  if (data.startsWith('dislike_')) {
    const listingId = data.replace('dislike_', '');
    ListingsRepo.ignoreListing(userId, listingId);
    TrackingRepo.removeTracked(userId, listingId);

    await ctx.answerCallbackQuery({ text: '🚫 Descartado. No volverás a ver este inmueble.' });

    const undoKeyboard = {
      inline_keyboard: [
        [{ text: '↩️ Deshacer y volver a mostrar', callback_data: `undislike_${listingId}` }],
      ],
    };

    try {
      await ctx.editMessageReplyMarkup({ reply_markup: undoKeyboard });
    } catch {
      // If cannot edit markup, send text
    }
    return;
  }

  // Undislike / Restore listing: undislike_<listingId>
  if (data.startsWith('undislike_')) {
    const listingId = data.replace('undislike_', '');
    ListingsRepo.unignoreListing(userId, listingId);

    await ctx.answerCallbackQuery({ text: '✅ Inmueble restaurado.' });

    const listing = ListingsRepo.getListingById(listingId);
    if (listing) {
      const { reply_markup } = MessageFormatter.formatListing(listing);
      try {
        await ctx.editMessageReplyMarkup({ reply_markup });
      } catch {
        // Skip
      }
    }
    return;
  }

  // Untrack listing: untrack_<listingId>
  if (data.startsWith('untrack_')) {
    const listingId = data.replace('untrack_', '');
    TrackingRepo.removeTracked(userId, listingId);
    await ctx.answerCallbackQuery({ text: '❌ Has dejado de seguir este inmueble.' });
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
    } catch {
      // Message might not be editable
    }
    return;
  }

  // Dismiss listing: dismiss_<listingId>
  if (data.startsWith('dismiss_')) {
    await ctx.answerCallbackQuery({ text: 'Anuncio ocultado' });
    try {
      await ctx.deleteMessage();
    } catch {
      // Skip if cannot delete
    }
    return;
  }

  // Toggle routine: toggle_routine_<id>
  if (data.startsWith('toggle_routine_')) {
    const id = parseInt(data.replace('toggle_routine_', ''), 10);
    const updated = RoutinesRepo.toggleRoutineActive(id, userId);
    if (updated) {
      await ctx.answerCallbackQuery({
        text: updated.isActive ? '▶️ Rutina reanudada' : '⏸️ Rutina pausada',
      });
      const summary = MessageFormatter.formatRoutineSummary(updated);
      try {
        await ctx.editMessageText(summary, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: updated.isActive ? '⏸️ Pausar' : '▶️ Reanudar', callback_data: `toggle_routine_${updated.id}` },
                { text: '🔎 Buscar Ahora', callback_data: `run_routine_${updated.id}` },
              ],
              [{ text: '🗑️ Eliminar Rutina', callback_data: `del_routine_${updated.id}` }],
            ],
          },
        });
      } catch {
        // Skip
      }
    }
    return;
  }

  // Run routine immediately: run_routine_<id>
  if (data.startsWith('run_routine_')) {
    const id = parseInt(data.replace('run_routine_', ''), 10);
    const routine = RoutinesRepo.getRoutineById(id);
    if (!routine) {
      await ctx.answerCallbackQuery({ text: 'Rutina no encontrada' });
      return;
    }

    await ctx.answerCallbackQuery({ text: '🔎 Ejecutando búsqueda...' });
    await ctx.reply(`🔎 <i>Ejecutando rutina: ${routine.name}...</i>`, { parse_mode: 'HTML' });

    try {
      const results = await scraperService.executeSearch(routine.filters);
      RoutinesRepo.updateRoutineLastRun(routine.id, results.length);

      // Filter out ignored listings
      const ignored = ListingsRepo.getIgnoredListingIds(userId);
      const filtered = results.filter(item => !ignored.has(item.id));

      if (filtered.length === 0) {
        await ctx.reply('ℹ️ No se han encontrado nuevos anuncios para los filtros de esta rutina (o han sido descartados previamente).');
        return;
      }

      await ctx.reply(`Encontrados <b>${filtered.length}</b> inmuebles disponibles:`, { parse_mode: 'HTML' });

      for (const item of filtered.slice(0, 5)) {
        ListingsRepo.upsertListing(item);
        const { text, reply_markup } = MessageFormatter.formatListing(item, routine.name);

        if (item.photos && item.photos.length > 0) {
          try {
            await ctx.replyWithPhoto(item.photos[0], { caption: text, parse_mode: 'HTML', reply_markup });
            continue;
          } catch {
            // Fallback
          }
        }
        await ctx.reply(text, { parse_mode: 'HTML', reply_markup });
      }
    } catch (err: any) {
      await ctx.reply(`❌ Error al ejecutar rutina: ${err.message}`);
    }
    return;
  }

  // Edit routine: edit_routine_<id>
  if (data.startsWith('edit_routine_')) {
    const id = parseInt(data.replace('edit_routine_', ''), 10);
    const routine = RoutinesRepo.getRoutineById(id);
    if (!routine || routine.userId !== userId) {
      await ctx.answerCallbackQuery({ text: 'Rutina no encontrada' });
      return;
    }

    await ctx.answerCallbackQuery();
    ctx.session.tempRoutine = { id: routine.id };
    await ctx.conversation.enter('editRoutineConversation');
    return;
  }

  // Delete routine: del_routine_<id>
  if (data.startsWith('del_routine_')) {
    const id = parseInt(data.replace('del_routine_', ''), 10);
    RoutinesRepo.deleteRoutine(id, userId);
    await ctx.answerCallbackQuery({ text: '🗑️ Rutina eliminada correctamente' });
    try {
      await ctx.deleteMessage();
    } catch {
      // Skip
    }
    return;
  }
}
