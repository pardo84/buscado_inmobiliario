import { Menu } from '@grammyjs/menu';
import { BotContext } from '../context.js';
import { RoutinesRepo } from '../../database/routines.repo.js';
import { MessageFormatter } from '../formatters/message.formatter.js';

export const routinesMenu = new Menu<BotContext>('routines-menu')
  .dynamic((ctx, range) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const routines = RoutinesRepo.getRoutinesByUser(userId);
    for (const r of routines) {
      const statusIcon = r.isActive ? '🟢' : '⏸️';
      range
        .text(`${statusIcon} ${r.name.substring(0, 25)}`, async ctx => {
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
        })
        .row();
    }
  })
  .text('➕ Crear Otra Rutina', async ctx => {
    await ctx.conversation.enter('createRoutineConversation');
  })
  .row()
  .back('⬅️ Volver al Menú Principal');
