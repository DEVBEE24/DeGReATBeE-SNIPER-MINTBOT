import { Bot } from 'grammy';
import { supabase } from '../config/supabase';
import { registerCommands } from './command';
import { registerHandlers } from './handlers';
import { interceptAddressMessage } from '../core/interceptor';
import { SUPPORTED_NETWORKS } from '../config/chains';
import { UserWithRelations } from '../types/database';

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN || '');

bot.use(async (ctx, next) => {
  if (!ctx.from) return;
  const telegramId = ctx.from.id.toString();

  let { data: user } = await supabase
    .from('users')
    .select(`
      *,
      settings:user_settings(*),
      wallets(*),
      whale_targets(*),
      chain_toggles(*)
    `)
    .eq('telegram_id', telegramId)
    .maybeSingle();

  if (!user) {
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        telegram_id: telegramId,
        username: ctx.from.username || ctx.from.first_name,
      })
      .select()
      .single();

    if (error) {
      console.error('[TelegramBot] Failed to create user:', error.message);
      return;
    }

    await supabase.from('user_settings').insert({
      user_id: newUser.id,
    });

    await Promise.all(
      SUPPORTED_NETWORKS.map((net) =>
        supabase.from('chain_toggles').insert({
          user_id: newUser.id,
          chain_name: net.chainName,
          enabled: true,
        })
      )
    );

    const { data: refetched } = await supabase
      .from('users')
      .select(`
        *,
        settings:user_settings(*),
        wallets(*),
        whale_targets(*),
        chain_toggles(*)
      `)
      .eq('id', newUser.id)
      .maybeSingle();

    user = refetched;
  }

  (ctx as any).dbUser = user as UserWithRelations;
  await next();
});

// Smart Chat Interceptor - auto-detect contract addresses
bot.on('message:text', async (ctx, next) => {
  if (!ctx.message || !ctx.message.text) return next();
  const text = ctx.message.text;

  if (text.startsWith('/')) return next();

  const addressRegex = /\b0x[a-fA-F0-9]{40}\b/;
  if (!addressRegex.test(text)) return next();

  const user: UserWithRelations = (ctx as any).dbUser;
  if (!user) return next();

  try {
    const result = await interceptAddressMessage(text);
    if (result) {
      await ctx.reply(result.auditSummary, {
        parse_mode: 'Markdown',
        reply_markup: result.keyboard,
      });
    }
  } catch (err: any) {
    console.error('[TelegramBot] Interceptor error:', err.message || err);
  }

  return next();
});

registerCommands(bot);
registerHandlers(bot);

bot.catch((err) => {
  console.error(`[TelegramBot] Error handling update:`, err.error);
});

export function startTelegramBot() {
  bot.start({
    onStart: (botInfo) => {
      console.log(`[TelegramBot] 🤖 Professional ApexBee Engine online as @${botInfo.username}.`);
    },
  });
}

export { bot };
