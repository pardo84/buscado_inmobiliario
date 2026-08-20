import { BotContext } from '../context.js';
import { UsersRepo } from '../../database/users.repo.js';
import { RoutinesRepo } from '../../database/routines.repo.js';
import { ListingsRepo } from '../../database/listings.repo.js';
import { TrackingRepo } from '../../database/tracking.repo.js';
import { scraperService } from '../../scrapers/index.js';
import { MessageFormatter } from '../formatters/message.formatter.js';
import { mainMenu } from '../menus/main.menu.js';
import { PropertyType, OperationType } from '../../types/listing.js';

export async function handleStart(ctx: BotContext) {
  const user = ctx.from;
  if (!user) return;

  UsersRepo.upsertUser({
    telegramId: user.id,
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
  });

  const welcomeText =
    `🏡 <b>¡HOLA ${user.first_name.toUpperCase()}! BIENVENIDO A TU BOT INMOBILIARIO</b>\n\n` +
    `Este bot busca continuamente viviendas en <b>Granollers, Cardedeu, La Roca del Vallès y Les Franqueses del Vallès</b> en las principales inmobiliarias, portales y activos de bancos.\n\n` +
    `✨ <b>¿Qué puedes hacer?</b>\n` +
    `1️⃣ <b>Configurar Rutinas Automáticas:</b> Define tus filtros (zona, barrios de Granollers, tipo de casa/piso, precio, habitaciones, bancos) y recibe alertas al instante.\n` +
    `2️⃣ <b>Seguimiento de Precios (⭐):</b> Pulsa "Seguir" en cualquier vivienda o pega un enlace aquí para avisarte de <b>bajadas de precio</b> o si el anuncio es retirado/vendido.\n` +
    `3️⃣ <b>Búsqueda Manual:</b> Consulta en tiempo real con <code>/buscar_ahora</code>.\n\n` +
    `👇 <b>Selecciona una opción del panel para comenzar:</b>`;

  await ctx.reply(welcomeText, {
    parse_mode: 'HTML',
    reply_markup: mainMenu,
  });
}

export async function handleHelp(ctx: BotContext) {
  const helpText =
    `📖 <b>GUÍA Y COMANDOS DISPONIBLES</b>\n\n` +
    `🔹 <b>/start</b> - Abre el menú principal interactivo.\n` +
    `🔹 <b>/crear_rutina</b> - Inicia el asistente para crear una nueva búsqueda automática.\n` +
    `🔹 <b>/rutinas</b> - Muestra y gestiona tus rutinas activas o pausadas.\n` +
    `🔹 <b>/seguimientos</b> - Consulta los pisos que tienes en seguimiento de precios.\n` +
    `🔹 <b>/buscar_ahora</b> - Realiza un rastreo manual inmediato.\n` +
    `🔹 <b>/stats</b> - Estadísticas del bot y estado del rastreo.\n\n` +
    `💡 <b>TRUCO:</b> Puedes pegar cualquier enlace de una vivienda en el chat (de Pisos.com, Fotocasa, Habitaclia, Solvia, Servihabitat, etc.) y el bot empezará a monitorizarla automáticamente para avisarte si baja de precio o desaparece.`;

  await ctx.reply(helpText, { parse_mode: 'HTML' });
}

export async function handleRoutines(ctx: BotContext) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const routines = RoutinesRepo.getRoutinesByUser(userId);
  if (routines.length === 0) {
    await ctx.reply(
      'ℹ️ No tienes ninguna rutina creada aún.\n\nUsa /crear_rutina para configurar tus alertas.',
      { parse_mode: 'HTML' }
    );
    return;
  }

  await ctx.reply('📋 <b>TUS RUTINAS DE BÚSQUEDA ACTIVAS:</b>\n\nPulsa en una para gestionarla:', {
    parse_mode: 'HTML',
  });

  for (const r of routines) {
    const summary = MessageFormatter.formatRoutineSummary(r);
    await ctx.reply(summary, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: r.isActive ? '⏸️ Pausar' : '▶️ Reanudar', callback_data: `toggle_routine_${r.id}` },
            { text: '✏️ Editar Rutina', callback_data: `edit_routine_${r.id}` },
          ],
          [
            { text: '🔎 Buscar Ahora', callback_data: `run_routine_${r.id}` },
            { text: '🗑️ Eliminar Rutina', callback_data: `del_routine_${r.id}` },
          ],
        ],
      },
    });
  }
}

export async function handleTracking(ctx: BotContext) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const tracked = TrackingRepo.getTrackedByUser(userId);
  if (tracked.length === 0) {
    await ctx.reply(
      'ℹ️ <b>No estás siguiendo ningún inmueble.</b>\n\n' +
      'Cuando el bot te envíe una vivienda, pulsa en <b>⭐ Seguir Anuncio</b> o pega un enlace aquí para rastrear sus cambios de precio.',
      { parse_mode: 'HTML' }
    );
    return;
  }

  await ctx.reply(`⭐ <b>TIENES ${tracked.length} INMUEBLES EN SEGUIMIENTO:</b>`, { parse_mode: 'HTML' });

  for (const item of tracked) {
    const text =
      `🏠 <b><a href="${item.url}">${MessageFormatter.escapeHtml(item.title)}</a></b>\n` +
      `📍 ${MessageFormatter.escapeHtml(item.town)}\n` +
      `💰 Precio actual: <b>${item.currentPrice.toLocaleString()} €</b>\n` +
      `🕒 Comprobado: ${item.lastCheckedAt}\n` +
      `🔗 <a href="${item.url}">Ver anuncio original</a>`;

    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 Abrir en web', url: item.url }],
          [{ text: '❌ Dejar de seguir', callback_data: `untrack_${item.listingId}` }],
        ],
      },
    });
  }
}

export async function handleSearchNow(ctx: BotContext) {
  const userId = ctx.from?.id;
  if (!userId) return;

  await ctx.reply('🔎 <i>Buscando viviendas en Granollers, Cardedeu, La Roca y Les Franqueses...</i>', {
    parse_mode: 'HTML',
  });

  try {
    const listings = await scraperService.executeSearch({
      propertyTypes: [PropertyType.PISO, PropertyType.CASA, PropertyType.DUPLEX, PropertyType.ATICO],
      operationType: OperationType.VENTA,
      locations: ['all_granollers', 'cardedeu', 'la_roca', 'les_franqueses'],
    });

    // Filter out ignored listings
    const ignored = ListingsRepo.getIgnoredListingIds(userId);
    const availableListings = listings.filter(l => !ignored.has(l.id));

    if (availableListings.length === 0) {
      await ctx.reply('⚠️ No se han encontrado nuevos anuncios en este momento (o han sido descartados previamente). Inténtalo de nuevo más tarde.');
      return;
    }

    await ctx.reply(`🎉 <b>Se han encontrado ${availableListings.length} inmuebles disponibles:</b>\nMostrando los más destacados:`, {
      parse_mode: 'HTML',
    });

    // Send top 5 listings
    for (const listing of availableListings.slice(0, 5)) {
      ListingsRepo.upsertListing(listing);
      const { text, reply_markup } = MessageFormatter.formatListing(listing);
      if (listing.photos && listing.photos.length > 0) {
        try {
          await ctx.replyWithPhoto(listing.photos[0], {
            caption: text,
            parse_mode: 'HTML',
            reply_markup,
          });
          continue;
        } catch {
          // Fallback to text if photo fails
        }
      }
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup });
    }
  } catch (err: any) {
    await ctx.reply(`❌ Error al realizar la búsqueda: ${err.message}`);
  }
}
