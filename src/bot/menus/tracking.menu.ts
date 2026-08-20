import { Menu } from '@grammyjs/menu';
import { BotContext } from '../context.js';
import { TrackingRepo } from '../../database/tracking.repo.js';
import { formatPrice } from '../../utils/text.js';
import { MessageFormatter } from '../formatters/message.formatter.js';

export const trackingMenu = new Menu<BotContext>('tracking-menu')
  .dynamic((ctx, range) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const tracked = TrackingRepo.getTrackedByUser(userId);
    for (const item of tracked) {
      const priceStr = formatPrice(item.currentPrice);
      range
        .text(`⭐ ${item.title.substring(0, 18)} (${priceStr})`, async ctx => {
          const diff = item.currentPrice - item.initialPrice;
          const diffText =
            diff < 0
              ? `📉 Bajada: <b>-${formatPrice(Math.abs(diff))}</b>`
              : diff > 0
              ? `📈 Subida: <b>+${formatPrice(diff)}</b>`
              : 'Precio sin cambios';

          const text =
            `⭐ <b>INMUEBLE EN SEGUIMIENTO</b>\n\n` +
            `🏠 <b><a href="${item.url}">${MessageFormatter.escapeHtml(item.title)}</a></b>\n` +
            `📍 <b>${MessageFormatter.escapeHtml(item.town)}</b>\n` +
            `💰 Precio actual: <b>${formatPrice(item.currentPrice)}</b>\n` +
            `💶 Precio inicial: <s>${formatPrice(item.initialPrice)}</s>\n` +
            `📊 Histórico: ${diffText}\n` +
            `📅 Registrado: ${item.createdAt}\n` +
            `🕒 Última comprobación: ${item.lastCheckedAt}\n\n` +
            `🔗 <a href="${item.url}"><b>👉 Ver anuncio original</b></a>`;

          await ctx.reply(text, {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🌐 Abrir en el navegador', url: item.url }],
                [{ text: '❌ Dejar de seguir este inmueble', callback_data: `untrack_${item.listingId}` }],
              ],
            },
          });
        })
        .row();
    }
  })
  .row()
  .back('⬅️ Volver al Menú Principal');
