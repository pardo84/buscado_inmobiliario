import { Context, SessionFlavor } from 'grammy';
import { Conversation, ConversationFlavor } from '@grammyjs/conversations';

export interface SessionData {
  tempRoutine?: Record<string, any>;
}

export type BotContext = ConversationFlavor<Context & SessionFlavor<SessionData>>;
export type BotConversation = Conversation<BotContext, BotContext>;
