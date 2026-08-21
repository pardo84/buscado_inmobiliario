import { Menu } from '@grammyjs/menu';
import { BotContext } from '../context.js';
import { RoutinesRepo } from '../../database/routines.repo.js';
import { TrackingRepo } from '../../database/tracking.repo.js';

export const mainMenu = new Menu<BotContext>('main-menu')
  .text('➕ Crear Nueva Rutina', async ctx => {
    await ctx.conversation.enter('createRoutineConversation');
  })
  .row()
  .text('📋 Mis Rutinas de Búsqueda', async ctx => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const count = RoutinesRepo.countRoutinesByUser(userId);
    if (count === 0) {
      await ctx.reply(
        'ℹ️ <b>No tienes rutinas activas todavía.</b>\n\nPulsa en <b>➕ Crear Nueva Rutina</b> para configurar tu primera búsqueda automática en Granollers, Cardedeu, La Roca o Les Franqueses.',
        { parse_mode: 'HTML' }
      );
      return;
    }
    await ctx.menu.nav('routines-menu');
  })
  .row()
  .text('⭐ Mis Inmuebles en Seguimiento', async ctx => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const tracked = TrackingRepo.getTrackedByUser(userId);
    if (tracked.length === 0) {
      await ctx.reply(
        'ℹ️ <b>No estás siguiendo ningún inmueble todavía.</b>\n\n' +
        'Puedes seguir inmuebles de dos formas:\n' +
        '1️⃣ Pulsando el botón <b>⭐ Seguir Anuncio</b> cuando el bot te notifique una vivienda.\n' +
        '2️⃣ Pegando directamente cualquier enlace de Pisos.com, Fotocasa, Habitaclia o Wallapop aquí en el chat.',
        { parse_mode: 'HTML' }
      );
      return;
    }
    await ctx.menu.nav('tracking-menu');
  })
  .row()
  .text('🔎 Búsqueda Manual Inmediata', async ctx => {
    await ctx.reply(
      '🔎 <b>BÚSQUEDA INMEDIATA</b>\n\n' +
      'Elige una rutina existente para ejecutar ahora mismo o usa /buscar_ahora para buscar en toda la zona.',
      { parse_mode: 'HTML' }
    );
  })
  .text('📊 Estadísticas', async ctx => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const routines = RoutinesRepo.getRoutinesByUser(userId);
    const tracked = TrackingRepo.getTrackedByUser(userId);

    await ctx.reply(
      `📊 <b>ESTADO DE TU BOT INMOBILIARIO</b>\n\n` +
      `📌 Rutinas configuradas: <b>${routines.length}</b> (${routines.filter(r => r.isActive).length} activas)\n` +
      `⭐ Inmuebles en seguimiento: <b>${tracked.length}</b>\n` +
      `🏘️ Zonas cubiertas: <i>Granollers (y barrios), Cardedeu, La Roca del Vallès, Les Franqueses</i>\n` +
      `🌐 Portales activos: <i>Pisos.com, Fotocasa, Habitaclia, Wallapop, Activos de Bancos</i>\n\n` +
      `⚡ El bot se ejecuta automáticamente en segundo plano.`,
      { parse_mode: 'HTML' }
    );
  });
