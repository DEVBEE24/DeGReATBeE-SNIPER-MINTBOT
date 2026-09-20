import { Bot, InlineKeyboard } from 'grammy';
import { PrismaClient } from '@prisma/client';
import { encryptPrivateKey } from '../core/crypto';
import { dispatchMintTransaction } from '../core/dispatcher';
import { privateKeyToAccount } from 'viem/accounts';

const prisma = new PrismaClient();
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN || '');

// Reusable Main Menu Inline Keyboard layout matching the user's dashboard design
const getMainMenuKeyboard = (autoMintActive: boolean = false) => {
  return new InlineKeyboard()
    .text("💼 My Wallets", "menu_wallets").text("➕ New Wallet", "menu_new_wallet").row()
    .text("🎯 Tracking", "menu_tracking").text("🖼️ My Portfolio", "menu_portfolio").row()
    .text("🔍 Scan Contract", "menu_scan").text("🚀 Manual Mint", "menu_manual_mint").row()
    .text("👁️ Watchlist", "menu_watchlist").text("🛡️ Settings / Gas", "menu_settings").row()
    .text(autoMintActive ? "⚡ Auto-Mint: ON" : "⚡ Auto-Mint: OFF", "menu_toggle_automint");
};

const backToMenuKeyboard = new InlineKeyboard().text("🏠 Main Menu", "menu_main");

// Multi-user database isolation middleware
bot.use(async (ctx, next) => {
  if (!ctx.from) return;
  const telegramId = ctx.from.id.toString();

  let user = await prisma.user.findUnique({
    where: { telegramId },
    include: { settings: true }
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        telegramId,
        username: ctx.from.username || ctx.from.first_name,
        settings: { create: {} },
      },
      include: { settings: true }
    });
  }
  (ctx as any).dbUser = user;
  await next();
});

// /start command
bot.command('start', async (ctx) => {
  const welcomeText = 
    `🤖 *Mint-Executor-Engine Dashboard*\n\n` +
    `Welcome! Manage your wallets, scan contracts, and auto-mint high-potential NFTs across multi-chains (Base, ETH, Robinhood, Arc, Ink).\n\n` +
    `Select an option below:`;

  await ctx.reply(welcomeText, {
    parse_mode: 'Markdown',
    reply_markup: getMainMenuKeyboard(false),
  });
});

// Callback Query Router for Inline Buttons
bot.callbackQuery('menu_main', async (ctx) => {
  await ctx.editMessageText(
    `🤖 *Mint-Executor-Engine Dashboard*\n\nSelect an option below:`,
    {
      parse_mode: 'Markdown',
      reply_markup: getMainMenuKeyboard(false),
    }
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu_wallets', async (ctx) => {
  const user = (ctx as any).dbUser;
  const wallets = await prisma.wallet.findMany({ where: { userId: user.id } });

  let response = '👛 *Your Configured Wallets:*\n\n';
  if (wallets.length === 0) {
    response += '⚠️ No wallets found. Click "New Wallet" to add one.';
  } else {
    wallets.forEach((w, index) => {
      response += `${index + 1}. *${w.label}*${w.isDefault ? '(Default)' : ''}\n   \`${w.address}\`\n\n`;
    });
  }

  await ctx.editMessageText(response, {
    parse_mode: 'Markdown',
    reply_markup: backToMenuKeyboard,
  });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu_new_wallet', async (ctx) => {
  await ctx.editMessageText(
    `➕ *Add New Wallet*\n\n` +
    `To link a secure wallet, send the command in chat like this:\n` +
    `\`/addwallet <private_key> [label]\`\n\n` +
    `*Example:* \`/addwallet 0xabc123... PrimarySniper\``,
    {
      parse_mode: 'Markdown',
      reply_markup: backToMenuKeyboard,
    }
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu_tracking', async (ctx) => {
  await ctx.editMessageText(
    `🎯 *Whale & Copy-Mint Tracking*\n\n` +
    `Monitor and mirror high-performing wallets in real-time across Base, ETH, and other chains.\n\n` +
    `Status: *Active and ready.*`,
    {
      parse_mode: 'Markdown',
      reply_markup: backToMenuKeyboard,
    }
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu_portfolio', async (ctx) => {
  await ctx.editMessageText(
    `🖼️ *My Portfolio*\n\n` +
    `Portfolio summary and minted NFT assets will appear here across your connected accounts.`,
    {
      parse_mode: 'Markdown',
      reply_markup: backToMenuKeyboard,
    }
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu_scan', async (ctx) => {
  await ctx.editMessageText(
    `🔍 *Contract Scanner*\n\n` +
    `Pre-flight contract verification is active. Send a contract address via text or use the snipe command to inspect bytecode and zero-wei pricing.`,
    {
      parse_mode: 'Markdown',
      reply_markup: backToMenuKeyboard,
    }
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu_manual_mint', async (ctx) => {
  await ctx.editMessageText(
    `🚀 *Manual Mint Execution*\n\n` +
    `To execute an instant free or paid mint, use the command format:\n` +
    `\`/snipe <chain> <contractAddress> <valueWei>\`\n\n` +
    `*Example:* \`/snipe base 0x123... 0\``,
    {
      parse_mode: 'Markdown',
      reply_markup: backToMenuKeyboard,
    }
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu_watchlist', async (ctx) => {
  await ctx.editMessageText(
    `👁️ *Active Watchlist*\n\n` +
    `No active target contracts in your watchlist right now.`,
    {
      parse_mode: 'Markdown',
      reply_markup: backToMenuKeyboard,
    }
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu_settings', async (ctx) => {
  const user = (ctx as any).dbUser;
  const settings = user.settings;

  await ctx.editMessageText(
    `🛡️ *Settings & Gas Configuration*\n\n` +
    `🔹 *Priority Gwei Tip:* ${settings?.priorityGwei || '2.0'} Gwei\n` +
    `🔹 *Default Gas Limit:* ${settings?.defaultGasLimit || '0.005'} ETH\n` +
    `🔹 *Slippage Tolerance:* ${settings?.slippageTolerance || 1}%\n`,
    {
      parse_mode: 'Markdown',
      reply_markup: backToMenuKeyboard,
    }
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu_toggle_automint', async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Auto-Mint toggled!" });
  await ctx.editMessageText(
    `🤖 *Mint-Executor-Engine Dashboard*\n\nSelect an option below:`,
    {
      parse_mode: 'Markdown',
      reply_markup: getMainMenuKeyboard(true),
    }
  );
});

// Command handlers
bot.command('addwallet', async (ctx) => {
  const user = (ctx as any).dbUser;
  const input = ctx.match?.trim() || '';
  const parts = input.split(' ');

  if (parts.length < 1 || !parts[0].startsWith('0x')) {
    return ctx.reply('⚠️ *Usage:* `/addwallet <private_key> [label]`', { parse_mode: 'Markdown' });
  }

  const rawKey = parts[0] as `0x${string}`;
  const label = parts.slice(1).join(' ') || 'Primary Sniper';

  try {
    const encryptedKey = encryptPrivateKey(rawKey);
    const account = privateKeyToAccount(rawKey);

    await prisma.wallet.create({
      data: {
        userId: user.id,
        address: account.address,
        encryptedKey,
        label,
        isDefault: true,
      },
    });

    await ctx.reply(
      `✅ *Wallet Successfully Added & Encrypted!*\n\n` +
      `🔹 *Address:* \`${account.address}\`\n` +
      `🏷 *Label:* ${label}`,
      { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard }
    );
  } catch (err: any) {
    await ctx.reply(`❌ *Failed to store wallet:* \`${err.message}\``, { parse_mode: 'Markdown' });
  }
});

bot.command('snipe', async (ctx) => {
  const user = (ctx as any).dbUser;
  const input = ctx.match?.trim() || '';
  const args = input.split(' ');

  if (args.length < 2) {
    return ctx.reply(
      '⚠️ *Usage:* `/snipe <chain> <contractAddress> [valueWei]`',
      { parse_mode: 'Markdown' }
    );
  }

  const [chainName, contractAddress, valueWeiStr = '0'] = args;
  const wallet = await prisma.wallet.findFirst({ where: { userId: user.id, isDefault: true } });

  if (!wallet) {
    return ctx.reply('❌ No default wallet found. Add a wallet first.', { parse_mode: 'Markdown' });
  }

  await ctx.reply(`🚀 *Running Pre-Flight & Dispatch on [${chainName.toUpperCase()}]*\nTarget: \`${contractAddress}\``, { parse_mode: 'Markdown' });

  const result = await dispatchMintTransaction({
    encryptedPrivateKey: wallet.encryptedKey,
    chainName,
    contractAddress: contractAddress as any,
    abi: [{ inputs: [], name: 'mint', outputs: [], stateMutability: 'payable', type: 'function' }],
    functionName: 'mint',
    args: [],
    valueWei: BigInt(valueWeiStr),
    maxPriorityFeeGwei: user.settings?.priorityGwei || '3.0',
    maxFeePerGasGwei: '30.0',
  });

  if (result.success) {
    await ctx.reply(`✅ *Mint Executed Successfully!*\n\n🔗 *Tx Hash:* \`${result.txHash}\``, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
  } else {
    await ctx.reply(`❌ *Execution Failed:*\n\`${result.error}\``, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
  }
});

// Error boundary to safely capture and print runtime issues in Railway logs
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`[TelegramBot] Error while handling update ${ctx.update.update_id}:`, err.error);
});

export function startTelegramBot() {
  bot.start();
  console.log('[TelegramBot] 🤖 Interactive Dashboard Bot is online.');
}
