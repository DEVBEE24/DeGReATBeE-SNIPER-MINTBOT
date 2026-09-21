import { Bot } from 'grammy';
import { PrismaClient } from '@prisma/client';
import { registerCommands } from './command';
import { registerHandlers } from './handlers';

const prisma = new PrismaClient();
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN || '');

const SUPPORTED_NETWORKS = [
  { chainName: 'base', name: 'Base' },
  { chainName: 'ethereum', name: 'Ethereum' },
  { chainName: 'robinhood', name: 'Robinhood Chain' },
  { chainName: 'ink', name: 'Ink' },
  { chainName: 'arc', name: 'Arc' },
];

// Multi-user profile initialization & self-healing middleware
bot.use(async (ctx, next) => {
  if (!ctx.from) return;
  const telegramId = ctx.from.id.toString();

  let user = await prisma.user.findUnique({
    where: { telegramId },
    include: { settings: true, chains: true, wallets: true, whaleTargets: true }
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        telegramId,
        username: ctx.from.username || ctx.from.first_name,
        settings: { create: {} },
        chains: {
          create: SUPPORTED_NETWORKS.map((net) => ({
            chainName: net.chainName,
            enabled: true,
          }))
        }
      },
      include: { settings: true, chains: true, wallets: true, whaleTargets: true }
    });
  }
  
  // Attach user to context for handlers and commands
  (ctx as any).dbUser = user;
  await next();
});

// Register modular commands and callback handlers
registerCommands(bot);
registerHandlers(bot);

bot.catch((err) => {
  console.error(`[TelegramBot] Error handling update:`, err.error);
});

export function startTelegramBot() {
  bot.start();
  console.log('[TelegramBot] 🤖 Professional ApexBee Engine online.');
}
