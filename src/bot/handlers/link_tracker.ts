import { BotContext } from '../context.js';
import { scraperService } from '../../scrapers/index.js';
import { ListingsRepo } from '../../database/listings.repo.js';
import { TrackingRepo } from '../../database/tracking.repo.js';
import { generateListingId, formatPrice } from '../../utils/text.js';
import { MessageFormatter } from '../formatters/message.formatter.js';
import { PropertyType, OperationType, ListingStatus } from '../../types/listing.js';

export async function handleDirectLink(ctx: BotContext) {
  const text = ctx.message?.text?.trim();
  const userId = ctx.from?.id;

  if (!text || !userId) return;

  // Check if text is a URL or contains real estate link
  const urlMatch = text.match(/https?:\/\/[^\s]+/i);
  if (!urlMatch) return;

  const url = urlMatch[0];

  // Check if it's a recognized portal URL
  const isRealEstateUrl =
    url.includes('habitaclia.com') ||
    url.includes('fotocasa.es') ||
    url.includes('pisos.com') ||
    url.includes('wallapop.com') ||
    url.includes('idealista.com') ||
    url.includes('yaencontre.com') ||
    url.includes('servihabitat.com') ||
    url.includes('solvia.es') ||
    url.includes('alisedainmobiliaria.com') ||
    url.includes('haya.es') ||
    url.includes('donpiso.com') ||
    url.includes('immotecnics.com');

  if (!isRealEstateUrl) {
    return;
  }

  await ctx.reply('🔎 <i>Inspeccionando enlace y extrayendo datos de la vivienda...</i>', {
    parse_mode: 'HTML',
  });

  try {
    const check = await scraperService.tracker.checkListing(url);

    let portal = 'web';
    if (url.includes('habitaclia')) portal = 'habitaclia';
    else if (url.includes('fotocasa')) portal = 'fotocasa';
    else if (url.includes('pisos.com')) portal = 'pisos.com';
    else if (url.includes('wallapop')) portal = 'wallapop';
    else if (url.includes('idealista')) portal = 'idealista';
    else if (url.includes('servihabitat')) portal = 'servihabitat';
    else if (url.includes('solvia')) portal = 'solvia';

    const listingId = generateListingId(portal, url);
    const title = check.title || 'Vivienda monitoreada';
    const price = check.currentPrice || 0;

    // Save in listings cache
    ListingsRepo.upsertListing({
      id: listingId,
      portal,
      url,
      title,
      price,
      currency: 'EUR',
      propertyType: PropertyType.PISO,
      operationType: OperationType.VENTA,
      town: 'Granollers / Zona',
      features: [],
      photos: check.photoUrl ? [check.photoUrl] : [],
      isBankProperty: portal === 'servihabitat' || portal === 'solvia',
      status: check.status,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    });

    // Add to user tracking
    const { tracked, isNew } = TrackingRepo.addTrackedListing({
      userId,
      listingId,
      url,
      portal,
      title,
      price,
      town: 'Granollers / Zona',
      photoUrl: check.photoUrl,
    });

    const replyMsg =
      `⭐ <b>¡INMUEBLE AÑADIDO AL SEGUIMIENTO!</b>\n\n` +
      `🏠 <b><a href="${url}">${MessageFormatter.escapeHtml(title)}</a></b>\n` +
      `💰 Precio actual: <b>${price > 0 ? formatPrice(price) : 'No detectado / A consultar'}</b>\n` +
      `🌐 Portal: <b>${portal.toUpperCase()}</b>\n\n` +
      `🤖 <i>El bot comprobará este anuncio periódicamente. Te avisará de inmediato si:</i>\n` +
      `• 📉 Hay una bajada de precio (con el % y diferencia en €).\n` +
      `• 📈 Hay una subida de precio.\n` +
      `• 🔴 El anuncio es retirado o vendido.`;

    await ctx.reply(replyMsg, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 Ver en el portal', url }],
          [{ text: '❌ Dejar de seguir', callback_data: `untrack_${listingId}` }],
        ],
      },
    });
  } catch (err: any) {
    await ctx.reply(`❌ No se pudo extraer la información del enlace: ${err.message}`);
  }
}
