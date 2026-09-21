import { Bot } from 'grammy';
import { pool, query, queryOne } from '../config/database';
import { registerCommands } from './command';
import { registerHandlers } from './handlers';
import { interceptAddressMessage } from '../core/interceptor';
import { SUPPORTED_NETWORKS } from '../config/chains';
import { User, UserSettings, Wallet, WhaleTarget, ChainToggle, UserWithRelations } from '../types/database';

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN || '');

bot.use(async (ctx, next) => {
  if (!ctx.from) return;
  const telegramId = ctx.from.id.toString();

  let user: any = await queryOne<User>(
    `SELECT * FROM users WHERE telegram_id = $1`,
    [telegramId]
  );

  if (!user) {
    const newUser = await queryOne<User>(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING *`,
      [telegramId, ctx.from.username || ctx.from.first_name]
    );

    if (!newUser) {
      console.error('[TelegramBot] Failed to create user');
      return;
    }

    await pool.query(
      `INSERT INTO user_settings (user_id) VALUES ($1)`,
      [newUser.id]
    );

    await Promise.all(
      SUPPORTED_NETWORKS.map((net) =>
        pool.query(
          `INSERT INTO chain_toggles (user_id, chain_name, enabled) VALUES ($1, $2, true)`,
          [newUser.id, net.chainName]
        )
      )
    );

    user = await queryOne<any>(
      `SELECT
        u.*,
        COALESCE(json_agg(DISTINCT w.*) FILTER (WHERE w.id IS NOT NULL), '[]') AS wallets,
        COALESCE(json_agg(DISTINCT wt.*) FILTER (WHERE wt.id IS NOT NULL), '[]') AS whale_targets,
        COALESCE(json_agg(DISTINCT ct.*) FILTER (WHERE ct.id IS NOT NULL), '[]') AS chain_toggles,
        s.* AS settings
      FROM users u
      LEFT JOIN wallets w ON w.user_id = u.id
      LEFT JOIN whale_targets wt ON wt.user_id = u.id
      LEFT JOIN chain_toggles ct ON ct.user_id = u.id
      LEFT JOIN user_settings s ON s.user_id = u.id
      WHERE u.id = $1
      GROUP BY u.id, s.id`,
      [newUser.id]
    );
  } else {
    const settings = await queryOne<UserSettings>(
      `SELECT * FROM user_settings WHERE user_id = $1`,
      [user.id]
    );
    const wallets = await query<Wallet>(
      `SELECT * FROM wallets WHERE user_id = $1`,
      [user.id]
    );
    const whaleTargets = await query<WhaleTarget>(
      `SELECT * FROM whale_targets WHERE user_id = $1`,
      [user.id]
    );
    const chainToggles = await query<ChainToggle>(
      `SELECT * FROM chain_toggles WHERE user_id = $1`,
      [user.id]
    );

    user.settings = settings || null;
    user.wallets = wallets;
    user.whale_targets = whaleTargets;
    user.chain_toggles = chainToggles;
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
