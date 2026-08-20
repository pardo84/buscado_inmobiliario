import { InlineKeyboard } from 'grammy';
import { BotContext, BotConversation } from '../context.js';
import { RoutinesRepo } from '../../database/routines.repo.js';
import { PropertyType, OperationType } from '../../types/listing.js';
import { GRANOLLERS_NEIGHBORHOODS } from '../../types/locations.js';
import { MessageFormatter } from '../formatters/message.formatter.js';
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

  const grBarrios = ALL_SELECTABLE_LOCATIONS.filter(l => l.category === 'Granollers');
  grBarrios.forEach((b, idx) => {
    const isChecked = selected.has(b.id);
    const label = `${isChecked ? '✅' : '⬜'} ${b.name}`;
    kb.text(label, `toggle_edit_loc_${b.id}`);
    if (idx % 2 === 1) kb.row();
  });
  if (grBarrios.length % 2 !== 0) kb.row();

  const otherTowns = ALL_SELECTABLE_LOCATIONS.filter(l => l.category !== 'Granollers');
  otherTowns.forEach(t => {
    const isChecked = selected.has(t.id);
    const label = `${isChecked ? '✅' : '⬜'} ${t.name}`;
    kb.text(label, `toggle_edit_loc_${t.id}`);
  });
  kb.row();

  kb.text('🏙️ Todos de Granollers', 'edit_shortcut_all_gr')
    .text('🌐 Los 4 Municipios', 'edit_shortcut_all_zone')
    .row()
    .text('🧹 Desmarcar todos', 'edit_shortcut_clear')
    .row();

  const count = selected.size;
  const continueLabel = count > 0 ? `💾 GUARDAR ZONAS (${count})` : '⚠️ Selecciona al menos 1 zona';
  kb.text(continueLabel, count > 0 ? 'edit_loc_done' : 'edit_loc_need_select');

  return kb;
}

export async function editRoutineConversation(conversation: BotConversation, ctx: BotContext) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const routineId = ctx.session.tempRoutine?.id;
  if (!routineId) {
    await ctx.reply('⚠️ No se ha seleccionado ninguna rutina para editar.');
    return;
  }

  let routine = RoutinesRepo.getRoutineById(routineId);
  if (!routine || routine.userId !== userId) {
    await ctx.reply('⚠️ Rutina no encontrada.');
    return;
  }

  const editMenuKb = new InlineKeyboard()
    .text('🏘️ Barrios y Zonas', 'edit_action_loc')
    .text('💶 Rango de Precios', 'edit_action_price')
    .row()
    .text('🏢 Tipo de Inmueble', 'edit_action_type')
    .text('🛏️ Habitaciones', 'edit_action_rooms')
    .row()
    .text('🏛️ Filtro de Bancos', 'edit_action_bank')
    .text('⏱️ Frecuencia de Rastreo', 'edit_action_freq')
    .row()
    .text('🏷️ Cambiar Nombre', 'edit_action_name')
    .row()
    .text('✅ Finalizar Edición', 'edit_action_finish');

  await ctx.reply(
    `✏️ <b>EDITAR RUTINA:</b> <i>${MessageFormatter.escapeHtml(routine.name)}</i>\n\n` +
    `${MessageFormatter.formatRoutineSummary(routine)}\n\n` +
    `👇 <b>Selecciona qué apartado deseas modificar:</b>`,
    { parse_mode: 'HTML', reply_markup: editMenuKb }
  );

  while (true) {
    const actionCtx = await conversation.waitForCallbackQuery([
      'edit_action_loc',
      'edit_action_price',
      'edit_action_type',
      'edit_action_rooms',
      'edit_action_bank',
      'edit_action_freq',
      'edit_action_name',
      'edit_action_finish',
    ]);
    await actionCtx.answerCallbackQuery();
    const action = actionCtx.callbackQuery.data;

    if (action === 'edit_action_finish') {
      await ctx.reply('✅ <b>Edición finalizada.</b> Todos los cambios han sido guardados.', {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔎 Buscar ahora con nuevos filtros', callback_data: `run_routine_${routine.id}` }],
            [{ text: '📋 Volver a Mis Rutinas', callback_data: 'menu_routines' }],
          ],
        },
      });
      break;
    }

    // 1. Edit Locations
    if (action === 'edit_action_loc') {
      const selected = new Set<string>(routine.filters.locations || []);

      await ctx.reply(
        '🏘️ <b>MODIFICAR BARRIOS Y ZONAS</b>\n\nToca los barrios para marcar o desmarcar y pulsa <b>GUARDAR ZONAS</b> al terminar:',
        { parse_mode: 'HTML', reply_markup: buildLocationKeyboard(selected) }
      );

      while (true) {
        const locCtx = await conversation.waitForCallbackQuery([
          /^toggle_edit_loc_/,
          'edit_shortcut_all_gr',
          'edit_shortcut_all_zone',
          'edit_shortcut_clear',
          'edit_loc_done',
          'edit_loc_need_select',
        ]);

        const d = locCtx.callbackQuery.data;

        if (d === 'edit_loc_done') {
          await locCtx.answerCallbackQuery({ text: 'Zonas actualizadas con éxito.' });
          break;
        }
        if (d === 'edit_loc_need_select') {
          await locCtx.answerCallbackQuery({ text: 'Selecciona al menos 1 zona.', show_alert: true });
          continue;
        }

        if (d.startsWith('toggle_edit_loc_')) {
          const locId = d.replace('toggle_edit_loc_', '');
          if (selected.has(locId)) selected.delete(locId);
          else selected.add(locId);
          await locCtx.answerCallbackQuery();
        } else if (d === 'edit_shortcut_all_gr') {
          GRANOLLERS_NEIGHBORHOODS.forEach(n => selected.add(`gr_${n.id}`));
          await locCtx.answerCallbackQuery({ text: 'Todos los barrios de Granollers marcados.' });
        } else if (d === 'edit_shortcut_all_zone') {
          ALL_SELECTABLE_LOCATIONS.forEach(l => selected.add(l.id));
          await locCtx.answerCallbackQuery({ text: 'Todos los 4 municipios y barrios marcados.' });
        } else if (d === 'edit_shortcut_clear') {
          selected.clear();
          await locCtx.answerCallbackQuery({ text: 'Selección limpiada.' });
        }

        try {
          await locCtx.editMessageReplyMarkup({ reply_markup: buildLocationKeyboard(selected) });
        } catch {
          // Skip
        }
      }

      routine.filters.locations = Array.from(selected);
      const updated = RoutinesRepo.updateRoutine(routine.id, userId, { filters: routine.filters });
      if (updated) routine = updated;

      await ctx.reply(
        `✅ <b>Zonas actualizadas (${routine.filters.locations.length} seleccionadas).</b>\n\n` +
        `¿Deseas modificar algo más?`,
        { parse_mode: 'HTML', reply_markup: editMenuKb }
      );
    }

    // 2. Edit Price
    if (action === 'edit_action_price') {
      const isRent = routine.filters.operationType === OperationType.ALQUILER;

      // Min price
      const minKb = new InlineKeyboard();
      if (isRent) {
        minKb
          .text('0 € (Sin mínimo)', 'pmin_0')
          .text('500 €', 'pmin_500')
          .text('700 €', 'pmin_700')
          .row()
          .text('900 €', 'pmin_900')
          .text('1.100 €', 'pmin_1100')
          .row()
          .text('✍️ Escribir precio mínimo', 'pmin_custom');
      } else {
        minKb
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
        `💶 <b>PRECIO MÍNIMO (Desde €)</b>\nActual: ${routine.filters.minPrice ? formatPrice(routine.filters.minPrice) : 'Sin mínimo'}`,
        { parse_mode: 'HTML', reply_markup: minKb }
      );

      const minCtx = await conversation.waitForCallbackQuery(/^pmin_/);
      await minCtx.answerCallbackQuery();

      let newMinPrice: number | undefined = undefined;
      if (minCtx.callbackQuery.data === 'pmin_custom') {
        await ctx.reply('✍️ Escribe el precio mínimo en euros (ej: <code>180000</code>):', { parse_mode: 'HTML' });
        const textCtx = await conversation.waitFor(':text');
        const parsed = parsePrice(textCtx.message?.text);
        if (parsed > 0) newMinPrice = parsed;
      } else {
        const val = parseInt(minCtx.callbackQuery.data.replace('pmin_', ''), 10);
        if (val > 0) newMinPrice = val;
      }

      // Max price
      const maxKb = new InlineKeyboard();
      if (isRent) {
        maxKb
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
        maxKb
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

      await ctx.reply(
        `💶 <b>PRECIO MÁXIMO (Hasta €)</b>\nActual: ${routine.filters.maxPrice ? formatPrice(routine.filters.maxPrice) : 'Sin límite'}`,
        { parse_mode: 'HTML', reply_markup: maxKb }
      );

      const maxCtx = await conversation.waitForCallbackQuery(/^pmax_/);
      await maxCtx.answerCallbackQuery();

      let newMaxPrice: number | undefined = undefined;
      if (maxCtx.callbackQuery.data === 'pmax_custom') {
        await ctx.reply('✍️ Escribe el precio máximo en euros (ej: <code>320000</code>):', { parse_mode: 'HTML' });
        const textCtx = await conversation.waitFor(':text');
        const parsed = parsePrice(textCtx.message?.text);
        if (parsed > 0) newMaxPrice = parsed;
      } else if (maxCtx.callbackQuery.data !== 'pmax_none') {
        newMaxPrice = parseInt(maxCtx.callbackQuery.data.replace('pmax_', ''), 10);
      }

      routine.filters.minPrice = newMinPrice;
      routine.filters.maxPrice = newMaxPrice;

      const updated = RoutinesRepo.updateRoutine(routine.id, userId, { filters: routine.filters });
      if (updated) routine = updated;

      const pDesc =
        newMinPrice && newMaxPrice
          ? `Entre ${formatPrice(newMinPrice)} y ${formatPrice(newMaxPrice)}`
          : newMaxPrice
          ? `Hasta ${formatPrice(newMaxPrice)}`
          : newMinPrice
          ? `Desde ${formatPrice(newMinPrice)}`
          : 'Sin límite';

      await ctx.reply(
        `✅ <b>Rango de precios actualizado:</b> ${pDesc}\n\n¿Deseas modificar algo más?`,
        { parse_mode: 'HTML', reply_markup: editMenuKb }
      );
    }

    // 3. Edit Property Type
    if (action === 'edit_action_type') {
      const typeKb = new InlineKeyboard()
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

      await ctx.reply('🏠 <b>Selecciona la nueva tipología de inmueble:</b>', {
        parse_mode: 'HTML',
        reply_markup: typeKb,
      });

      const tCtx = await conversation.waitForCallbackQuery(/^type_/);
      await tCtx.answerCallbackQuery();
      const tData = tCtx.callbackQuery.data.replace('type_', '');

      routine.filters.propertyTypes =
        tData === 'cualquiera'
          ? [PropertyType.PISO, PropertyType.CASA, PropertyType.DUPLEX, PropertyType.ATICO]
          : [tData as PropertyType];

      const updated = RoutinesRepo.updateRoutine(routine.id, userId, { filters: routine.filters });
      if (updated) routine = updated;

      await ctx.reply(`✅ <b>Tipo de inmueble actualizado a:</b> <i>${routine.filters.propertyTypes.join(', ')}</i>\n\n¿Deseas modificar algo más?`, {
        parse_mode: 'HTML',
        reply_markup: editMenuKb,
      });
    }

    // 4. Edit Rooms
    if (action === 'edit_action_rooms') {
      const roomKb = new InlineKeyboard()
        .text('Cualquiera', 'rooms_0')
        .text('1+', 'rooms_1')
        .text('2+', 'rooms_2')
        .text('3+', 'rooms_3')
        .text('4+', 'rooms_4');

      await ctx.reply('🛏️ <b>Selecciona las habitaciones mínimas:</b>', {
        parse_mode: 'HTML',
        reply_markup: roomKb,
      });

      const rCtx = await conversation.waitForCallbackQuery(/^rooms_/);
      await rCtx.answerCallbackQuery();
      const rVal = parseInt(rCtx.callbackQuery.data.replace('rooms_', ''), 10);
      routine.filters.minRooms = rVal > 0 ? rVal : undefined;

      const updated = RoutinesRepo.updateRoutine(routine.id, userId, { filters: routine.filters });
      if (updated) routine = updated;

      await ctx.reply(`✅ <b>Habitaciones mínimas actualizadas a:</b> ${routine.filters.minRooms ? routine.filters.minRooms + '+' : 'Cualquiera'}\n\n¿Deseas modificar algo más?`, {
        parse_mode: 'HTML',
        reply_markup: editMenuKb,
      });
    }

    // 5. Edit Bank Filter
    if (action === 'edit_action_bank') {
      const bankKb = new InlineKeyboard()
        .text('🏛️ Incluir Todo (Particulares, Agencias y Bancos)', 'bank_all')
        .row()
        .text('🏦 Solo Inmuebles de Banco / Embargos', 'bank_only')
        .row()
        .text('🚫 Excluir Bancos', 'bank_exclude');

      await ctx.reply('🏛️ <b>Configura el filtro de bancos / embargos:</b>', {
        parse_mode: 'HTML',
        reply_markup: bankKb,
      });

      const bCtx = await conversation.waitForCallbackQuery(['bank_all', 'bank_only', 'bank_exclude']);
      await bCtx.answerCallbackQuery();
      const bChoice = bCtx.callbackQuery.data;

      routine.filters.bankPropertiesOnly = bChoice === 'bank_only';
      routine.filters.excludeBankProperties = bChoice === 'bank_exclude';

      const updated = RoutinesRepo.updateRoutine(routine.id, userId, { filters: routine.filters });
      if (updated) routine = updated;

      await ctx.reply('✅ <b>Filtro de bancos actualizado.</b>\n\n¿Deseas modificar algo más?', {
        parse_mode: 'HTML',
        reply_markup: editMenuKb,
      });
    }

    // 6. Edit Frequency
    if (action === 'edit_action_freq') {
      const freqKb = new InlineKeyboard()
        .text('⚡ Cada 15 minutos', 'freq_15')
        .text('⏱️ Cada 30 minutos', 'freq_30')
        .row()
        .text('🕐 Cada 1 hora', 'freq_60')
        .text('🕑 Cada 2 horas', 'freq_120')
        .row()
        .text('📅 1 vez al día', 'freq_1440');

      await ctx.reply('⏱️ <b>Selecciona la nueva frecuencia de rastreo:</b>', {
        parse_mode: 'HTML',
        reply_markup: freqKb,
      });

      const fCtx = await conversation.waitForCallbackQuery(/^freq_/);
      await fCtx.answerCallbackQuery();
      const interval = parseInt(fCtx.callbackQuery.data.replace('freq_', ''), 10);

      const updated = RoutinesRepo.updateRoutine(routine.id, userId, { intervalMinutes: interval });
      if (updated) routine = updated;

      await ctx.reply(`✅ <b>Frecuencia actualizada a: Cada ${interval} minutos.</b>\n\n¿Deseas modificar algo más?`, {
        parse_mode: 'HTML',
        reply_markup: editMenuKb,
      });
    }

    // 7. Edit Name
    if (action === 'edit_action_name') {
      await ctx.reply('🏷️ Escribe el nuevo nombre descriptivo para esta rutina (ej: <i>Casas Centro con Piscina</i>):', {
        parse_mode: 'HTML',
      });
      const nameCtx = await conversation.waitFor(':text');
      const newName = nameCtx.message?.text?.trim();

      if (newName && newName.length > 2) {
        const updated = RoutinesRepo.updateRoutine(routine.id, userId, { name: newName });
        if (updated) routine = updated;
        await ctx.reply(`✅ <b>Nombre actualizado a:</b> <i>${MessageFormatter.escapeHtml(routine.name)}</i>\n\n¿Deseas modificar algo más?`, {
          parse_mode: 'HTML',
          reply_markup: editMenuKb,
        });
      }
    }
  }
}
