import { InlineKeyboard } from 'grammy';
import { BotContext, BotConversation } from '../context.js';
import { RoutinesRepo } from '../../database/routines.repo.js';
import { PropertyType, OperationType } from '../../types/listing.js';
import { RoutineFilters } from '../../types/routine.js';
import { GRANOLLERS_NEIGHBORHOODS, Town } from '../../types/locations.js';
import { parsePrice, formatPrice } from '../../utils/text.js';
import { logger } from '../../utils/logger.js';

interface SelectableLocation {
  id: string;
  name: string;
  category: string;
}

const ALL_SELECTABLE_LOCATIONS: SelectableLocation[] = [
  ...GRANOLLERS_NEIGHBORHOODS.map(n => ({
    id: `gr_${n.id}`,
    name: n.name,
    category: 'Granollers',
  })),
  { id: 'cardedeu', name: 'Cardedeu', category: 'Otros Municipios' },
  { id: 'la_roca', name: 'La Roca del Vallès', category: 'Otros Municipios' },
  { id: 'les_franqueses', name: 'Les Franqueses', category: 'Otros Municipios' },
];

function buildLocationKeyboard(selected: Set<string>): InlineKeyboard {
  const kb = new InlineKeyboard();

  // Granollers neighborhoods (2 per row)
  const grBarrios = ALL_SELECTABLE_LOCATIONS.filter(l => l.category === 'Granollers');
  grBarrios.forEach((b, idx) => {
    const isChecked = selected.has(b.id);
    const label = `${isChecked ? '✅' : '⬜'} ${b.name}`;
    kb.text(label, `toggle_loc_${b.id}`);
    if (idx % 2 === 1) kb.row();
  });
  if (grBarrios.length % 2 !== 0) kb.row();

  // Other towns
  const otherTowns = ALL_SELECTABLE_LOCATIONS.filter(l => l.category !== 'Granollers');
  otherTowns.forEach(t => {
    const isChecked = selected.has(t.id);
    const label = `${isChecked ? '✅' : '⬜'} ${t.name}`;
    kb.text(label, `toggle_loc_${t.id}`);
  });
  kb.row();

  // Quick shortcuts
  kb.text('🏙️ Todos de Granollers', 'shortcut_all_granollers')
    .text('🌐 Los 4 Municipios', 'shortcut_all_zone')
    .row()
    .text('🧹 Desmarcar todos', 'shortcut_clear')
    .row();

  // Continue button
  const count = selected.size;
  const continueLabel = count > 0 ? `➡️ CONTINUAR (${count} seleccionados)` : '⚠️ Selecciona al menos 1 zona';
  kb.text(continueLabel, count > 0 ? 'loc_done' : 'loc_need_select');

  return kb;
}

export async function createRoutineConversation(conversation: BotConversation, ctx: BotContext) {
  const userId = ctx.from?.id;
  if (!userId) return;

  // Step 1: Operation Type
  const opKeyboard = new InlineKeyboard()
    .text('🏠 Comprar / Venta', 'op_comprar')
    .text('🔑 Alquiler', 'op_alquiler');

  await ctx.reply(
    '🛠️ <b>NUEVA RUTINA DE BÚSQUEDA (1/7)</b>\n\n' +
    '¿Qué tipo de operación deseas buscar?',
    { parse_mode: 'HTML', reply_markup: opKeyboard }
  );

  const opCtx = await conversation.waitForCallbackQuery(['op_comprar', 'op_alquiler']);
  await opCtx.answerCallbackQuery();
  const operationType = opCtx.callbackQuery.data === 'op_alquiler' ? OperationType.ALQUILER : OperationType.VENTA;
  const isRent = operationType === OperationType.ALQUILER;

  // Step 2: Property Type
  const typeKeyboard = new InlineKeyboard()
    .text('🏢 Piso / Apartamento', 'type_piso')
    .text('🏡 Casa / Chalet', 'type_casa')
    .row()
    .text('🏙️ Dúplex', 'type_duplex')
    .text('🌅 Ático', 'type_atico')
    .row()
    .text('🚗 Parking / Garaje', 'type_parking')
    .text('🌲 Terreno / Solar', 'type_terreno')
    .row()
    .text('✨ Cualquiera / Todos', 'type_cualquiera');

  await ctx.reply(
    '🏠 <b>TIPO DE INMUEBLE (2/7)</b>\n\n' +
    'Selecciona la tipología de vivienda que te interesa:',
    { parse_mode: 'HTML', reply_markup: typeKeyboard }
  );

  const typeCtx = await conversation.waitForCallbackQuery([
    'type_piso',
    'type_casa',
    'type_duplex',
    'type_atico',
    'type_parking',
    'type_terreno',
    'type_cualquiera',
  ]);
  await typeCtx.answerCallbackQuery();

  const typeData = typeCtx.callbackQuery.data.replace('type_', '');
  const propertyTypes: PropertyType[] =
    typeData === 'cualquiera'
      ? [PropertyType.PISO, PropertyType.CASA, PropertyType.DUPLEX, PropertyType.ATICO]
      : [typeData as PropertyType];

  // Step 3: Multi-select Location & Neighborhoods
  const selectedLocations = new Set<string>();
  selectedLocations.add('gr_centre');

  await ctx.reply(
    '📍 <b>SELECCIÓN DE BARRIOS Y MUNICIPIOS (3/7)</b>\n\n' +
    '👇 <b>Toca los barrios que quieras para marcar (✅) o desmarcar (⬜).</b>\n' +
    '<i>Puedes elegir varios barrios a la vez para esta rutina. Cuando termines, pulsa CONTINUAR:</i>',
    {
      parse_mode: 'HTML',
      reply_markup: buildLocationKeyboard(selectedLocations),
    }
  );

  // Multi-selection loop
  while (true) {
    const locCtx = await conversation.waitForCallbackQuery([
      /^toggle_loc_/,
      'shortcut_all_granollers',
      'shortcut_all_zone',
      'shortcut_clear',
      'loc_done',
      'loc_need_select',
    ]);

    const data = locCtx.callbackQuery.data;

    if (data === 'loc_done') {
      if (selectedLocations.size === 0) {
        await locCtx.answerCallbackQuery({ text: 'Por favor, selecciona al menos 1 barrio o zona.', show_alert: true });
        continue;
      }
      await locCtx.answerCallbackQuery();
      break;
    }

    if (data === 'loc_need_select') {
      await locCtx.answerCallbackQuery({ text: 'Por favor, selecciona al menos 1 barrio o zona.', show_alert: true });
      continue;
    }

    if (data.startsWith('toggle_loc_')) {
      const locId = data.replace('toggle_loc_', '');
      if (selectedLocations.has(locId)) {
        selectedLocations.delete(locId);
      } else {
        selectedLocations.add(locId);
      }
      await locCtx.answerCallbackQuery();
    } else if (data === 'shortcut_all_granollers') {
      GRANOLLERS_NEIGHBORHOODS.forEach(n => selectedLocations.add(`gr_${n.id}`));
      await locCtx.answerCallbackQuery({ text: 'Todos los barrios de Granollers marcados.' });
    } else if (data === 'shortcut_all_zone') {
      ALL_SELECTABLE_LOCATIONS.forEach(l => selectedLocations.add(l.id));
      await locCtx.answerCallbackQuery({ text: 'Todos los 4 municipios y barrios marcados.' });
    } else if (data === 'shortcut_clear') {
      selectedLocations.clear();
      await locCtx.answerCallbackQuery({ text: 'Selección limpiada.' });
    }

    try {
      await locCtx.editMessageReplyMarkup({
        reply_markup: buildLocationKeyboard(selectedLocations),
      });
    } catch {
      // Ignore identical edit errors
    }
  }

  const locations = Array.from(selectedLocations);
  const selectedNames = locations.map(id => {
    const found = ALL_SELECTABLE_LOCATIONS.find(l => l.id === id);
    return found ? found.name : id;
  });

  // Step 4A: Minimum Price (Desde €)
  const minPriceKb = new InlineKeyboard();
  if (isRent) {
    minPriceKb
      .text('0 € (Sin mínimo)', 'pmin_0')
      .text('500 €', 'pmin_500')
      .text('700 €', 'pmin_700')
      .row()
      .text('900 €', 'pmin_900')
      .text('1.100 €', 'pmin_1100')
      .text('1.300 €', 'pmin_1300')
      .row()
      .text('✍️ Escribir precio mínimo', 'pmin_custom');
  } else {
    minPriceKb
      .text('0 € (Sin mínimo)', 'pmin_0')
      .text('100.000 €', 'pmin_100000')
      .text('150.000 €', 'pmin_150000')
      .row()
      .text('200.000 €', 'pmin_200000')
      .text('250.000 €', 'pmin_250000')
      .text('300.000 €', 'pmin_300000')
      .row()
      .text('✍️ Escribir precio mínimo', 'pmin_custom');
  }

  await ctx.reply(
    `✅ <b>Zonas seleccionadas (${locations.length}):</b> <i>${selectedNames.join(', ')}</i>\n\n` +
    '💶 <b>PRECIO MÍNIMO (4A/7)</b>\n' +
    '¿Cuál es el precio mínimo <i>(Desde €)</i> que debe tener el inmueble?',
    { parse_mode: 'HTML', reply_markup: minPriceKb }
  );

  const minPriceCtx = await conversation.waitForCallbackQuery(/^pmin_/);
  await minPriceCtx.answerCallbackQuery();

  let minPrice: number | undefined = undefined;
  if (minPriceCtx.callbackQuery.data === 'pmin_custom') {
    await ctx.reply('✍️ Por favor, escribe el precio mínimo en euros (ejemplo: <code>180000</code>):', {
      parse_mode: 'HTML',
    });
    const textCtx = await conversation.waitFor(':text');
    const parsed = parsePrice(textCtx.message?.text);
    if (parsed > 0) minPrice = parsed;
  } else {
    const val = parseInt(minPriceCtx.callbackQuery.data.replace('pmin_', ''), 10);
    if (val > 0) minPrice = val;
  }

  // Step 4B: Maximum Price (Hasta €)
  const maxPriceKb = new InlineKeyboard();
  if (isRent) {
    maxPriceKb
      .text('800 €', 'pmax_800')
      .text('1.000 €', 'pmax_1000')
      .text('1.200 €', 'pmax_1200')
      .row()
      .text('1.500 €', 'pmax_1500')
      .text('2.000 €', 'pmax_2000')
      .row()
      .text('♾️ Sin límite máximo', 'pmax_none')
      .text('✍️ Escribir precio máximo', 'pmax_custom');
  } else {
    maxPriceKb
      .text('150.000 €', 'pmax_150000')
      .text('200.000 €', 'pmax_200000')
      .text('250.000 €', 'pmax_250000')
      .row()
      .text('300.000 €', 'pmax_300000')
      .text('350.000 €', 'pmax_350000')
      .text('450.000 €', 'pmax_450000')
      .row()
      .text('600.000 €', 'pmax_600000')
      .text('♾️ Sin límite máximo', 'pmax_none')
      .row()
      .text('✍️ Escribir precio máximo', 'pmax_custom');
  }

  const minPriceDisplay = minPrice ? `<b>Desde:</b> ${formatPrice(minPrice)}\n\n` : '';

  await ctx.reply(
    `${minPriceDisplay}` +
    '💶 <b>PRECIO MÁXIMO (4B/7)</b>\n' +
    'Selecciona el tope de precio <i>(Hasta €)</i> o elige sin límite:',
    { parse_mode: 'HTML', reply_markup: maxPriceKb }
  );

  const maxPriceCtx = await conversation.waitForCallbackQuery(/^pmax_/);
  await maxPriceCtx.answerCallbackQuery();

  let maxPrice: number | undefined = undefined;
  if (maxPriceCtx.callbackQuery.data === 'pmax_custom') {
    await ctx.reply('✍️ Por favor, escribe el precio máximo en euros (ejemplo: <code>320000</code>):', {
      parse_mode: 'HTML',
    });
    const textCtx = await conversation.waitFor(':text');
    const parsed = parsePrice(textCtx.message?.text);
    if (parsed > 0) maxPrice = parsed;
  } else if (maxPriceCtx.callbackQuery.data !== 'pmax_none') {
    maxPrice = parseInt(maxPriceCtx.callbackQuery.data.replace('pmax_', ''), 10);
  }

  // Step 5: Minimum Bedrooms
  let minRooms: number | undefined = undefined;
  if (!propertyTypes.includes(PropertyType.PARKING) && !propertyTypes.includes(PropertyType.TERRENO)) {
    const roomKeyboard = new InlineKeyboard()
      .text('Cualquiera', 'rooms_0')
      .text('1+', 'rooms_1')
      .text('2+', 'rooms_2')
      .text('3+', 'rooms_3')
      .text('4+', 'rooms_4');

    await ctx.reply(
      '🛏️ <b>HABITACIONES MÍNIMAS (5/7)</b>\n\n' +
      '¿Cuántas habitaciones mínimas debe tener el inmueble?',
      { parse_mode: 'HTML', reply_markup: roomKeyboard }
    );

    const roomCtx = await conversation.waitForCallbackQuery(/^rooms_/);
    await roomCtx.answerCallbackQuery();
    const roomsVal = parseInt(roomCtx.callbackQuery.data.replace('rooms_', ''), 10);
    if (roomsVal > 0) minRooms = roomsVal;
  }

  // Step 6: Bank properties filter
  const bankKeyboard = new InlineKeyboard()
    .text('🏛️ Incluir Todo (Particulares, Agencias y Bancos)', 'bank_all')
    .row()
    .text('🏦 Solo Inmuebles de Banco / Embargos', 'bank_only')
    .row()
    .text('🚫 Excluir Bancos', 'bank_exclude');

  await ctx.reply(
    '🏛️ <b>FILTRO DE BANCOS Y SERVICERS (6/7)</b>\n\n' +
    '¿Deseas buscar también activos bancarios (Servihabitat, Solvia, Aliseda, etc.)?',
    { parse_mode: 'HTML', reply_markup: bankKeyboard }
  );

  const bankCtx = await conversation.waitForCallbackQuery(['bank_all', 'bank_only', 'bank_exclude']);
  await bankCtx.answerCallbackQuery();
  const bankChoice = bankCtx.callbackQuery.data;
  const bankPropertiesOnly = bankChoice === 'bank_only';
  const excludeBankProperties = bankChoice === 'bank_exclude';

  // Step 7: Frequency
  const freqKeyboard = new InlineKeyboard()
    .text('⚡ Cada 15 minutos', 'freq_15')
    .text('⏱️ Cada 30 minutos', 'freq_30')
    .row()
    .text('🕐 Cada 1 hora', 'freq_60')
    .text('🕑 Cada 2 horas', 'freq_120')
    .row()
    .text('📅 1 vez al día', 'freq_1440');

  await ctx.reply(
    '⏱️ <b>FRECUENCIA DE MONITOREO (7/7)</b>\n\n' +
    '¿Con qué frecuencia deseas que el bot rastree nuevas viviendas?',
    { parse_mode: 'HTML', reply_markup: freqKeyboard }
  );

  const freqCtx = await conversation.waitForCallbackQuery(/^freq_/);
  await freqCtx.answerCallbackQuery();
  const intervalMinutes = parseInt(freqCtx.callbackQuery.data.replace('freq_', ''), 10);

  // Price range label
  let priceStr = '';
  if (minPrice && maxPrice) {
    priceStr = `${minPrice.toLocaleString()}€ - ${maxPrice.toLocaleString()}€`;
  } else if (maxPrice) {
    priceStr = `< ${maxPrice.toLocaleString()}€`;
  } else if (minPrice) {
    priceStr = `> ${minPrice.toLocaleString()}€`;
  }

  // Name calculation
  const locStr = selectedNames.slice(0, 3).join(', ') + (selectedNames.length > 3 ? ` +${selectedNames.length - 3}` : '');
  const defaultName = `${propertyTypes.join('/')} en ${locStr} ${priceStr ? '(' + priceStr + ')' : ''}`.trim();

  const filters: RoutineFilters = {
    propertyTypes,
    operationType,
    locations,
    minPrice,
    maxPrice,
    minRooms,
    bankPropertiesOnly,
    excludeBankProperties,
  };

  const newRoutine = RoutinesRepo.createRoutine({
    userId,
    name: defaultName,
    filters,
    intervalMinutes,
  });

  logger.info({ routine: newRoutine }, 'Routine with min/max price created successfully by user');

  const priceSummary =
    minPrice && maxPrice
      ? `Entre <b>${formatPrice(minPrice)}</b> y <b>${formatPrice(maxPrice)}</b>`
      : maxPrice
      ? `Hasta <b>${formatPrice(maxPrice)}</b>`
      : minPrice
      ? `Desde <b>${formatPrice(minPrice)}</b>`
      : 'Sin límite de precio';

  await ctx.reply(
    `✅ <b>¡RUTINA CREADA Y ACTIVADA CON ÉXITO!</b>\n\n` +
    `📌 <b>Nombre:</b> ${newRoutine.name}\n` +
    `⏱️ <b>Frecuencia:</b> Cada ${newRoutine.intervalMinutes} min\n` +
    `📍 <b>Barrios/Zonas (${locations.length}):</b> <i>${selectedNames.join(', ')}</i>\n` +
    `💰 <b>Rango de Precio:</b> ${priceSummary}\n\n` +
    `🤖 <i>El bot rastreará continuamente todas las zonas seleccionadas dentro de tu rango de precio. En cuanto aparezca una nueva vivienda o cambie de precio, recibirás un mensaje directo.</i>`,
    {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard()
        .text('🔎 Buscar ahora mismo', `run_routine_${newRoutine.id}`)
        .row()
        .text('📋 Ver todas mis rutinas', 'menu_routines'),
    }
  );
}
