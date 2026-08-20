import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { CONFIG } from '../config.js';
import { BotContext } from './context.js';
import { mainMenu } from './menus/main.menu.js';
import { routinesMenu } from './menus/routines.menu.js';
import { trackingMenu } from './menus/tracking.menu.js';
import { createRoutineConversation } from './conversations/create_routine.js';
import { editRoutineConversation } from './conversations/edit_routine.js';
import {
  handleStart,
  handleHelp,
  handleRoutines,
  handleTracking,
  handleSearchNow,
} from './handlers/commands.js';
import { handleCallbacks } from './handlers/callbacks.js';
import { handleDirectLink } from './handlers/link_tracker.js';
import { logger } from '../utils/logger.js';

export function createBot(): Bot<BotContext> {
  const token = CONFIG.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.warn('TELEGRAM_BOT_TOKEN is not set in environment or .env file');
  }

  const bot = new Bot<BotContext>(token || 'dummy_token');

  // Middleware: Session
  bot.use(
    session({
      initial: () => ({}),
    })
  );

  // Middleware: Conversations
  bot.use(conversations());
  bot.use(createConversation(createRoutineConversation));
  bot.use(createConversation(editRoutineConversation));

  // Menus
  mainMenu.register(routinesMenu);
  mainMenu.register(trackingMenu);
  bot.use(mainMenu);

  // Command handlers
  bot.command('start', handleStart);
  bot.command('help', handleHelp);
  bot.command('crear_rutina', async ctx => {
    await ctx.conversation.enter('createRoutineConversation');
  });
  bot.command('rutinas', handleRoutines);
  bot.command('seguimientos', handleTracking);
  bot.command('buscar_ahora', handleSearchNow);
  bot.command('stats', async ctx => {
    await ctx.reply('📊 Obteniendo estadísticas...');
  });

  // Callback query handlers
  bot.on('callback_query:data', handleCallbacks);

  // Message handler for URLs (Direct link tracking)
  bot.on('message:text', async (ctx, next) => {
    const text = ctx.message.text;
    if (text.startsWith('http://') || text.startsWith('https://')) {
      await handleDirectLink(ctx);
      return;
    }
    await next();
  });

  // Global error handler
  bot.catch(err => {
    logger.error({ error: err.error, ctx: err.ctx?.update }, 'GrammY bot error occurred');
  });

  return bot;
}
