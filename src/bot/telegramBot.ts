import { Bot, InlineKeyboard } from 'grammy';
import { PrismaClient } from '@prisma/client';
import { encryptPrivateKey } from '../core/crypto';
import { dispatchMintTransaction } from '../core/dispatcher';
import { runPreFlightCheck } from '../core/scanner';
import { getChainConfig } from '../core/walletManager';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { createPublicClient, http, formatEther, Address } from 'viem';

const prisma = new PrismaClient();
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN || '');

// Helper to build main keyboard with dynamic Auto-Mint state
const getMainMenuKeyboard = (autoMintActive: boolean = false) => {
  return new InlineKeyboard()
    .text("💼 My Wallets", "menu_wallets").text("➕ New Wallet", "menu_new_wallet").row()
    .text("⛓️ Chains Hub", "menu_chains").text("🎯 Tracking", "menu_tracking").row()
    .text("🖼️ Portfolio", "menu_portfolio").text("🔍 Scan Contract", "menu_scan").row()
    .text("🚀 Manual Mint", "menu_manual_mint").text("👁️ Watchlist", "menu_watchlist").row()
    .text("🛡️ Settings / Gas", "menu_settings").row()
    .text(autoMintActive ? "⚡ Auto-Mint: ON" : "⚡ Auto-Mint: OFF", "menu_toggle_automint");
};

const backToMenuKeyboard = new InlineKeyboard().text("🏠 Main Menu", "menu_main");

// Multi-user isolation & automatic profile initialization middleware
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
          create: [
            { chainName: 'base', enabled: true },
            { chainName: 'ethereum', enabled: true },
            { chainName: 'robinhood', enabled: false },
            { chainName: 'ink', enabled: false },
            { chainName: 'arc', enabled: false },
          ]
        }
      },
      include: { settings: true, chains: true, wallets: true, whaleTargets: true }
    });
  }
  (ctx as any).dbUser = user;
  await next();
});

// /start command
bot.command('start', async (ctx) => {
  const user = (ctx as any).dbUser;
  const welcomeText = 
    `🤖 *ApexBee Professional Sniper Engine*\n\n` +
    `Welcome back, *${user.username || 'Trader'}*!\n` +
    `Your high-speed multi-chain EVM terminal is fully active and synchronized.\n\n` +
    `Select an option below:`;

  await ctx.reply(welcomeText, {
    parse_mode: 'Markdown',
    reply_markup: getMainMenuKeyboard(user.settings?.autoMintActive || false),
  });
});

// --- CALLBACK ROUTER ---

bot.callbackQuery('menu_main', async (ctx) => {
  const user = (ctx as any).dbUser;
  await ctx.editMessageText(
    `🤖 *ApexBee Professional Sniper Engine*\n\nSelect an option below:`,
    {
      parse_mode: 'Markdown',
      reply_markup: getMainMenuKeyboard(user.settings?.autoMintActive || false),
    }
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu_wallets', async (ctx) => {
  const user = (ctx as any).dbUser;
  const wallets = await prisma.wallet.findMany({ where: { userId: user.id } });

  let response = '👛 *Your Configured Wallets:*\n\n';
  if (wallets.length === 0) {
    response += '⚠️ No wallets found. Click "New Wallet" to generate or import one.';
  } else {
    wallets.forEach((w, index) => {
      response += `${index + 1}. *${w.label}*${w.isDefault ? '🟢 *(Default)*' : ''}\n   \`${w.address}\`\n\n`;
    });
  }

  const keyboard = new InlineKeyboard().text("➕ Add / Generate Wallet", "menu_new_wallet").row().text("🏠 Main Menu", "menu_main");

  await ctx.editMessageText(response, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu_new_wallet', async (ctx) => {
  const keyboard = new InlineKeyboard()
    .text("🎲 Generate Fresh Wallet", "menu_generate_wallet").row()
    .text("📥 Import via Command", "menu_import_info").row()
    .text("🏠 Main Menu", "menu_main");

  await ctx.editMessageText(
    `➕ *Wallet Management Hub*\n\n` +
    `Choose how you would like to add a trading account:\n\n` +
    `• *Generate Fresh Wallet:* Instantly create a secure encrypted burner wallet.\n` +
    `• *Import Existing Key:* Use command \`/addwallet <private_key> [label]\``,
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    }
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu_import_info', async (ctx) => {
  await ctx.editMessageText(
    `📥 *Import Existing Private Key*\n\n` +
    `Send the following command directly in chat:\n` +
    `\`/addwallet 0xYourPrivateKeyHere MyCustomLabel\`\n\n` +
    `Your key will be securely encrypted using AES-256-GCM at rest.`,
    {
      parse_mode: 'Markdown',
      reply_markup: backToMenuKeyboard,
    }
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu_generate_wallet', async (ctx) => {
  const user = (ctx as any).dbUser;

  try {
    const rawPrivateKey = generatePrivateKey();
    const account = privateKeyToAccount(rawPrivateKey);
    const encryptedKey = encryptPrivateKey(rawPrivateKey);

    const existingCount = await prisma.wallet.count({ where: { userId: user.id } });
    const label = `Sniper Wallet #${existingCount + 1}`;
    const isDefault = existingCount === 0;

    await prisma.wallet.create({
      data: { userId: user.id, address: account.address, encryptedKey, label, isDefault },
    });

    await ctx.editMessageText(
      `🎉 *New Wallet Generated Successfully!*\n\n` +
      `🏷 *Label:* ${label}\n` +
      `🔹 *Address:* \`${account.address}\`\n\n` +
      `🔑 *Private Key:* \`${rawPrivateKey}\`\n\n` +
      `⚠️ *IMPORTANT:* Securely back up this private key.`,
      { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard }
    );
  } catch (err: any) {
    await ctx.editMessageText(`❌ *Generation Error:* \`${err.message}\``, {
      parse_mode: 'Markdown',
      reply_markup: backToMenuKeyboard,
    });
  }
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu_chains', async (ctx) => {
  const user = (ctx as any).dbUser;
  const chains = await prisma.chainToggle.findMany({ where: { userId: user.id } });

  const keyboard = new InlineKeyboard();
  chains.forEach((c) => {
    const statusEmoji = c.enabled ? '🟢 [ENABLED]' : '🔴 [DISABLED]';
    keyboard.text(`${c.chainName.toUpperCase()}${statusEmoji}`, `toggle_chain_${c.chainName}`).row();
  });
  keyboard.text("🏠 Main Menu", "menu_main");

  await ctx.editMessageText(
    `⛓️ *Chains Hub & Network Toggles*\n\n` +
    `Tap any network below to toggle its execution status instantly across your engine:`,
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    }
  );
  await ctx.answerCallbackQuery();
});

// Handle individual chain toggle clicks
bot.callbackQuery(/^toggle_chain_(.+)$/, async (ctx) => {
  const user = (ctx as any).dbUser;
  const chainName = ctx.match[1];

  const current = await prisma.chainToggle.findUnique({
    where: { userId_chainName: { userId: user.id, chainName } }
  });

  if (current) {
    await prisma.chainToggle.update({
      where: { id: current.id },
      data: { enabled: !current.enabled }
    });
  }

  // Refresh chain view
  const chains = await prisma.chainToggle.findMany({ where: { userId: user.id } });
  const keyboard = new InlineKeyboard();
  chains.forEach((c) => {
    const statusEmoji = c.enabled ? '🟢 [ENABLED]' : '🔴 [DISABLED]';
    keyboard.text(`${c.chainName.toUpperCase()}${statusEmoji}`, `toggle_chain_${c.chainName}`).row();
  });
  keyboard.text("🏠 Main Menu", "menu_main");

  await ctx.editMessageText(`⛓️ *Chains Hub & Network Toggles*\n\nUpdated [${chainName.toUpperCase()}] status:`, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
  await ctx.answerCallbackQuery({ text: `Toggled ${chainName}` });
});

bot.callbackQuery('menu_tracking', async (ctx) => {
  const user = (ctx as any).dbUser;
  const targets = await prisma.whaleTarget.findMany({ where: { userId: user.id } });

  let response = '🎯 *Whale Copy-Snipe Tracking Hub*\n\n';
  if (targets.length === 0) {
    response += '⚠️ No active whale wallets tracked.\n\n';
  } else {
    targets.forEach((t, i) => {
      response += `${i + 1}. *${t.label}* (${t.chainName.toUpperCase()})\n   \`${t.address}\`\n\n`;
    });
  }

  response += `*To add a whale:* \`/addwhale <chain> <address> [label]\`\n*To remove:* \`/removewhale <address>\``;

  await ctx.editMessageText(response, {
    parse_mode: 'Markdown',
    reply_markup: backToMenuKeyboard,
  });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu_portfolio', async (ctx) => {
  const user = (ctx as any).dbUser;
  const wallets = await prisma.wallet.findMany({ where: { userId: user.id } });

  if (wallets.length === 0) {
    return ctx.editMessageText('🖼️ *Portfolio*\n\nNo wallets connected. Add a wallet to view live balances.', {
      parse_mode: 'Markdown',
      reply_markup: backToMenuKeyboard,
    });
  }

  let report = '🖼️ *Live Portfolio Balance Summary:*\n\n';

  for (const w of wallets) {
    report += `👛 *${w.label}* (\`${w.address.slice(0, 6)}...${w.address.slice(-4)}\`)\n`;
    try {
      const chain = getChainConfig('base'); // Default base check
      const client = createPublicClient({ chain, transport: http() });
      const balanceWei = await client.getBalance({ address: w.address as Address });
      report += `   🔹 Base Balance: *${formatEther(balanceWei)} ETH*\n\n`;
    } catch {
      report += `   🔹 Balance fetch error\n\n`;
    }
  }

  await ctx.editMessageText(report, {
    parse_mode: 'Markdown',
    reply_markup: backToMenuKeyboard,
  });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu_scan', async (ctx) => {
  await ctx.editMessageText(
    `🔍 *Pre-Flight Contract Scanner*\n\n` +
    `Send any EVM contract address in chat or use the command:\n` +
    `\`/scan <chain> <contractAddress>\`\n\n` +
    `The engine will verify bytecode execution, zero-wei pricing, and simulate safety checks.`,
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
    `Execute instant free or paid mints with priority gas settings:\n` +
    `\`/snipe <chain> <contractAddress> <valueWei>\`\n\n` +
    `*Example:* \`/snipe base 0x123...abc 0\``,
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
    `No target contracts currently staged in your watchlist.`,
    {
      parse_mode: 'Markdown',
      reply_markup: backToMenuKeyboard,
    }
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu_settings', async (ctx) => {
  const user = (ctx as any).dbUser;
  const s = user.settings;

  const keyboard = new InlineKeyboard()
    .text("⚡ Set Priority: 2 Gwei", "set_gwei_2").text("⚡ Set Priority: 5 Gwei", "set_gwei_5").row()
    .text("⚡ Set Priority: 10 Gwei", "set_gwei_10").row()
    .text("🏠 Main Menu", "menu_main");

  await ctx.editMessageText(
    `🛡️ *Settings & Gas Configuration Panel*\n\n` +
    `🔹 *Current Priority Tip:* ${s?.priorityGwei || '3.0'} Gwei\n` +
    `🔹 *Default Gas Limit:* ${s?.defaultGasLimit || '0.005'} ETH\n` +
    `🔹 *Slippage Tolerance:* ${s?.slippageTolerance || 1}%\n\n` +
    `Tap a button below to update your priority tip instantly:`,
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    }
  );
  await ctx.answerCallbackQuery();
});

// Quick Gas Setters
bot.callbackQuery(/^set_gwei_(\d+)$/, async (ctx) => {
  const user = (ctx as any).dbUser;
  const gweiVal = ctx.match[1] + '.0';

  await prisma.userSettings.update({
    where: { userId: user.id },
    data: { priorityGwei: gweiVal }
  });

  await ctx.answerCallbackQuery({ text: `Priority tip updated to ${gweiVal} Gwei!` });
  
  // Refresh settings screen
  const updatedUser = await prisma.user.findUnique({ where: { id: user.id }, include: { settings: true } });
  const s = updatedUser?.settings;
  const keyboard = new InlineKeyboard()
    .text("⚡ Set Priority: 2 Gwei", "set_gwei_2").text("⚡ Set Priority: 5 Gwei", "set_gwei_5").row()
    .text("⚡ Set Priority: 10 Gwei", "set_gwei_10").row()
    .text("🏠 Main Menu", "menu_main");

  await ctx.editMessageText(
    `🛡️ *Settings & Gas Configuration Panel*\n\n` +
    `🔹 *Current Priority Tip:* ${s?.priorityGwei || '3.0'} Gwei\n` +
    `🔹 *Default Gas Limit:* ${s?.defaultGasLimit || '0.005'} ETH\n` +
    `🔹 *Slippage Tolerance:* ${s?.slippageTolerance || 1}%\n\n` +
    `✅ Successfully updated priority tip to *${gweiVal} Gwei*!`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
});

bot.callbackQuery('menu_toggle_automint', async (ctx) => {
  const user = (ctx as any).dbUser;
  const currentStatus = user.settings?.autoMintActive || false;
  const newStatus = !currentStatus;

  await prisma.userSettings.update({
    where: { userId: user.id },
    data: { autoMintActive: newStatus }
  });

  await ctx.answerCallbackQuery({ text: `Auto-Mint is now ${newStatus ? 'ON' : 'OFF'}` });
  await ctx.editMessageText(
    `🤖 *ApexBee Professional Sniper Engine*\n\nSelect an option below:`,
    {
      parse_mode: 'Markdown',
      reply_markup: getMainMenuKeyboard(newStatus),
    }
  );
});

// --- COMMAND HANDLERS ---

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
    const existingCount = await prisma.wallet.count({ where: { userId: user.id } });

    await prisma.wallet.create({
      data: { userId: user.id, address: account.address, encryptedKey, label, isDefault: existingCount === 0 },
    });

    await ctx.reply(
      `✅ *Wallet Successfully Encrypted & Saved!*\n\n` +
      `🔹 *Address:* \`${account.address}\`\n` +
      `🏷 *Label:* ${label}`,
      { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard }
    );
  } catch (err: any) {
    await ctx.reply(`❌ *Failed to store wallet:* \`${err.message}\``, { parse_mode: 'Markdown' });
  }
});

bot.command('addwhale', async (ctx) => {
  const user = (ctx as any).dbUser;
  const input = ctx.match?.trim() || '';
  const parts = input.split(' ');

  if (parts.length < 2) {
    return ctx.reply('⚠️ *Usage:* `/addwhale <chain> <address> [label]`\n*Example:* `/addwhale base 0x123...abc SmartWhale`', { parse_mode: 'Markdown' });
  }

  const [chainName, address, ...labelParts] = parts;
  const label = labelParts.join(' ') || 'Whale Target';

  try {
    await prisma.whaleTarget.create({
      data: { userId: user.id, chainName: chainName.toLowerCase(), address, label }
    });
    await ctx.reply(`✅ *Whale Target Added Successfully!*\n\nTarget: \`${address}\` on [${chainName.toUpperCase()}]`, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
  } catch (err: any) {
    await ctx.reply(`❌ *Error adding whale:* \`${err.message}\``, { parse_mode: 'Markdown' });
  }
});

bot.command('removewhale', async (ctx) => {
  const user = (ctx as any).dbUser;
  const address = ctx.match?.trim();

  if (!address) {
    return ctx.reply('⚠️ *Usage:* `/removewhale <address>`', { parse_mode: 'Markdown' });
  }

  try {
    await prisma.whaleTarget.deleteMany({
      where: { userId: user.id, address: { equals: address, mode: 'insensitive' } }
    });
    await ctx.reply(`✅ *Whale target removed:* \`${address}\``, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
  } catch (err: any) {
    await ctx.reply(`❌ *Error removing whale:* \`${err.message}\``, { parse_mode: 'Markdown' });
  }
});

bot.command('scan', async (ctx) => {
  const input = ctx.match?.trim() || '';
  const parts = input.split(' ');

  if (parts.length < 2) {
    return ctx.reply('⚠️ *Usage:* `/scan <chain> <contractAddress>`', { parse_mode: 'Markdown' });
  }

  const [chainName, contractAddress] = parts;
  const chain = getChainConfig(chainName);
  const rpcUrl = chain.rpcUrls.default.http[0];

  await ctx.reply(`🔍 *Running Pre-Flight Security & Bytecode Scan on [${chainName.toUpperCase()}]*...`);

  const check = await runPreFlightCheck(chainName, contractAddress as Address, rpcUrl, 0n);
  if (check.isValid) {
    await ctx.reply(`✅ *Pre-Flight Passed!*\nContract bytecode and gas parameters look safe for execution.`, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
  } else {
    await ctx.reply(`❌ *Pre-Flight Warning:* ${check.error}`, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
  }
});

bot.command('snipe', async (ctx) => {
  const user = (ctx as any).dbUser;
  const input = ctx.match?.trim() || '';
  const args = input.split(' ');

  if (args.length < 2) {
    return ctx.reply('⚠️ *Usage:* `/snipe <chain> <contractAddress> [valueWei]`', { parse_mode: 'Markdown' });
  }

  const [chainName, contractAddress, valueWeiStr = '0'] = args;
  const wallet = await prisma.wallet.findFirst({ where: { userId: user.id, isDefault: true } });

  if (!wallet) {
    return ctx.reply('❌ No default wallet found. Generate or add a wallet first.', { parse_mode: 'Markdown' });
  }

  await ctx.reply(`🚀 *Executing High-Speed Dispatch on [${chainName.toUpperCase()}]*\nTarget: \`${contractAddress}\``, { parse_mode: 'Markdown' });

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
    await ctx.reply(`❌ *Execution Reverted:*\n\`{result.error}\``, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
  }
});

// Robust error boundary
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`[TelegramBot] Error handling update ${ctx.update.update_id}:`, err.error);
});

export function startTelegramBot() {
  bot.start();
  console.log('[TelegramBot] 🤖 Professional ApexBee Engine online.');
}
