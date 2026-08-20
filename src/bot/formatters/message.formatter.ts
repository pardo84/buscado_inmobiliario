import { InlineKeyboard } from 'grammy';
import { PropertyListing, TrackedListing, ListingStatus } from '../../types/listing.js';
import { SearchRoutine } from '../../types/routine.js';
import { formatPrice, calculatePriceDrop } from '../../utils/text.js';

export const MessageFormatter = {
  formatListing(listing: PropertyListing, routineName?: string): { text: string; reply_markup: InlineKeyboard } {
    const isBank = listing.isBankProperty ? '🏛️ <b>[INMUEBLE DE BANCO]</b>\n' : '';
    const routineHeader = routineName ? `🔔 <b>Alerta:</b> <i>${this.escapeHtml(routineName)}</i>\n\n` : '';

    const priceText = `💰 <b>${formatPrice(listing.price)}</b>` +
      (listing.pricePerSqm ? ` <i>(${listing.pricePerSqm.toLocaleString()} €/m²)</i>` : '');

    const details: string[] = [];
    if (listing.rooms) details.push(`🛏️ ${listing.rooms} habs`);
    if (listing.bathrooms) details.push(`🚿 ${listing.bathrooms} baños`);
    if (listing.sqm) details.push(`📐 ${listing.sqm} m²`);

    const detailsLine = details.length > 0 ? `${details.join('  •  ')}\n` : '';

    const featuresLine =
      listing.features.length > 0
        ? `✨ <i>${listing.features.map(f => `#${f}`).join(' ')}</i>\n`
        : '';

    const locationLine = `📍 <b>${this.escapeHtml(listing.town)}</b>` +
      (listing.neighborhood ? ` (${this.escapeHtml(listing.neighborhood)})` : '') +
      `\n`;

    const agencyLine = listing.agency ? `🏢 Inmobiliaria: <i>${this.escapeHtml(listing.agency)}</i>\n` : '';
    const portalLine = `🌐 Fuente: <b>${this.escapeHtml(listing.portal.toUpperCase())}</b>\n`;

    const text =
      `${routineHeader}${isBank}` +
      `🏠 <b><a href="${listing.url}">${this.escapeHtml(listing.title)}</a></b>\n\n` +
      `${priceText}\n` +
      `${locationLine}` +
      `${detailsLine}` +
      `${featuresLine}` +
      `${agencyLine}` +
      `${portalLine}\n` +
      `🔗 <a href="${listing.url}"><b>👉 Ver anuncio completo en ${listing.portal.toUpperCase()}</b></a>`;

    const keyboard = new InlineKeyboard()
      .url('🌐 Abrir Anuncio', listing.url)
      .row()
      .text('⭐ Seguir Anuncio', `track_${listing.id}`)
      .text('🚫 No me interesa', `dislike_${listing.id}`);

    return { text, reply_markup: keyboard };
  },

  formatPriceDrop(
    tracked: TrackedListing,
    oldPrice: number,
    newPrice: number
  ): { text: string; reply_markup: InlineKeyboard } {
    const calc = calculatePriceDrop(oldPrice, newPrice);
    const dropSign = calc.isDrop ? '📉 <b>¡BAJADA DE PRECIO!</b>' : '📈 <b>Subida de precio</b>';
    const pct = `${calc.isDrop ? '-' : '+'}${calc.percentage}%`;
    const diff = `${calc.isDrop ? '-' : '+'}${formatPrice(calc.diff)}`;

    const text =
      `${dropSign}\n\n` +
      `🏠 <b><a href="${tracked.url}">${this.escapeHtml(tracked.title)}</a></b>\n` +
      `📍 <b>${this.escapeHtml(tracked.town)}</b>` +
      (tracked.neighborhood ? ` (${this.escapeHtml(tracked.neighborhood)})` : '') +
      `\n\n` +
      `❌ Precio anterior: <s>${formatPrice(oldPrice)}</s>\n` +
      `✅ <b>Nuevo precio: ${formatPrice(newPrice)}</b>\n` +
      `📊 Variación: <b>${pct}</b> (${diff})\n\n` +
      `🔗 <a href="${tracked.url}"><b>👉 Ver anuncio actualizado</b></a>`;

    const keyboard = new InlineKeyboard()
      .url('🌐 Abrir Anuncio', tracked.url)
      .row()
      .text('❌ Dejar de seguir', `untrack_${tracked.listingId}`)
      .text('🚫 Descartar', `dislike_${tracked.listingId}`);

    return { text, reply_markup: keyboard };
  },

  formatStatusChange(
    tracked: TrackedListing,
    status: ListingStatus
  ): { text: string; reply_markup: InlineKeyboard } {
    let statusText = 'ℹ️ Estado actualizado';
    if (status === ListingStatus.REMOVED) {
      statusText = '🔴 <b>¡ANUNCIO RETIRADO O VENDIDO!</b>\nEl inmueble ya no está disponible o ha sido dado de baja.';
    } else if (status === ListingStatus.RESERVED) {
      statusText = '🟡 <b>¡INMUEBLE RESERVADO!</b>\nEl anuncio aparece como reservado.';
    } else if (status === ListingStatus.SOLD) {
      statusText = '🟢 <b>¡INMUEBLE VENDIDO!</b>';
    }

    const text =
      `${statusText}\n\n` +
      `🏠 <b><a href="${tracked.url}">${this.escapeHtml(tracked.title)}</a></b>\n` +
      `📍 ${this.escapeHtml(tracked.town)}\n` +
      `💰 Último precio registrado: <b>${formatPrice(tracked.currentPrice)}</b>\n\n` +
      `🔗 <a href="${tracked.url}">Enlace al anuncio</a>`;

    const keyboard = new InlineKeyboard()
      .url('🌐 Ver en web', tracked.url)
      .text('❌ Eliminar de seguimiento', `untrack_${tracked.listingId}`);

    return { text, reply_markup: keyboard };
  },

  formatRoutineSummary(r: SearchRoutine): string {
    const status = r.isActive ? '🟢 Activa' : '⏸️ Pausada';
    const op = r.filters.operationType === 'alquiler' ? 'Alquiler' : 'Compra / Venta';
    const types = (r.filters.propertyTypes || []).join(', ') || 'Cualquiera';
    const locs = (r.filters.locations || [])
      .map(l => l.replace('gr_', 'Gr-').replace('all_', ''))
      .join(', ');

    let price = 'Sin límite';
    if (r.filters.minPrice && r.filters.maxPrice) {
      price = `Entre ${formatPrice(r.filters.minPrice)} y ${formatPrice(r.filters.maxPrice)}`;
    } else if (r.filters.maxPrice) {
      price = `Hasta ${formatPrice(r.filters.maxPrice)}`;
    } else if (r.filters.minPrice) {
      price = `Desde ${formatPrice(r.filters.minPrice)}`;
    }

    const bank = r.filters.bankPropertiesOnly ? 'Solo bancos' : r.filters.excludeBankProperties ? 'Excluir bancos' : 'Todos';

    return (
      `📌 <b>${this.escapeHtml(r.name)}</b> (${status})\n` +
      `▫️ Operación: <b>${op}</b>\n` +
      `▫️ Tipos: <i>${types}</i>\n` +
      `▫️ Zonas/Barrios: <i>${locs}</i>\n` +
      `▫️ Rango de precio: <b>${price}</b>\n` +
      `▫️ Bancos: <i>${bank}</i>\n` +
      `▫️ Frecuencia: Cada <b>${r.intervalMinutes} min</b>\n` +
      `▫️ Último escaneo: ${r.lastRunAt || 'Pendiente'}`
    );
  },

  escapeHtml(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },
};
