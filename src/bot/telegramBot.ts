import { Bot, InlineKeyboard } from 'grammy';
import { PrismaClient } from '@prisma/client';
import { encryptPrivateKey, decryptPrivateKey } from '../core/crypto';
import { dispatchMintTransaction } from '../core/dispatcher';
import { runSecurityAudit } from '../core/scanner';
import { getChainConfig } from '../core/walletManager';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { createPublicClient, http, formatEther, Address } from 'viem';

const prisma = new PrismaClient();
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN || '');

// Main Menu layout matching your exact professional design
const getMainMenuKeyboard = (autoMintActive: boolean = false) => {
  return new InlineKeyboard()
    .text("🔍 Scan Contract", "menu_scan").text("👁️ Watchlist", "menu_watchlist").row()
    .text("💼 My Wallets", "menu_wallets").text("⚙️ Chains", "menu_chains").row()
    .text("🖼️ My Portfolio", "menu_portfolio").text("🎯 Tracking", "menu_tracking").row()
    .text("🛡️ Settings / Gas", "menu_settings").text("📖 Help", "menu_help").row()
    .text(autoMintActive ? "⚡ Auto-Mint: ON" : "⚡ Auto-Mint: OFF", "menu_toggle_automint");
};

const backToMenuKeyboard = new InlineKeyboard().text("🏠 Main Menu", "menu_main");

// Multi-user profile initialization middleware
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
            { chainName: 'robinhood', enabled: true },
            { chainName: 'ink', enabled: true },
            { chainName: 'arc', enabled: true },
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
    `Your high-speed multi-chain EVM mint & security auditing terminal is active.\n\n` +
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

// My Wallets Hub with management options
bot.callbackQuery('menu_wallets', async (ctx) => {
  const user = (ctx as any).dbUser;
  const wallets = await prisma.wallet.findMany({ where: { userId: user.id } });

  let response = '👛 *Configured Trading Wallets:*\n\n';
  const keyboard = new InlineKeyboard();

  if (wallets.length === 0) {
    response += '⚠️ No wallets found. Generate or import one below.';
  } else {
    wallets.forEach((w, index) => {
      const statusIcon = w.isActive ? '🟢 [Active]' : '🔴 [Inactive]';
      response += `${index + 1}. *${w.label}*${statusIcon}\n   \`${w.address}\`\n\n`;
      
      // Add individual action buttons for each wallet
      keyboard.text(`🔑 Export #${index+1}`, `wallet_export_${w.id}`)
              .text(`⚡ Toggle #${index+1}`, `wallet_toggle_${w.id}`).row();
    });
  }

  keyboard.text("🎲 Generate Fresh Wallet", "menu_generate_wallet").row()
          .text("➕ Import Key (/addwallet)", "menu_import_info").row()
          .text("🏠 Main Menu", "menu_main");

  await ctx.editMessageText(response, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
  await ctx.answerCallbackQuery();
});

// Wallet Export Handler
bot.callbackQuery(/^wallet_export_(.+)$/, async (ctx) => {
  const walletId = ctx.match[1];
  try {
    const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) return ctx.answerCallbackQuery({ text: "Wallet not found." });

    const decryptedKey = decryptPrivateKey(wallet.encryptedKey);
    await ctx.reply(
      `🔑 *Exported Private Key for [${wallet.label}]*\n\n` +
      `Address: \`${wallet.address}\`\n` +
      `Private Key: \`${decryptedKey}\`\n\n` +
      `⚠️ *Keep this secure! Delete this message after copying.*`,
      { parse_mode: 'Markdown' }
    );
    await ctx.answerCallbackQuery({ text: "Wallet exported successfully" });
  } catch (err: any) {
    await ctx.answerCallbackQuery({ text: `Export failed: ${err.message}` });
  }
});

// Wallet Toggle Active/Inactive Handler
bot.callbackQuery(/^wallet_toggle_(.+)$/, async (ctx) => {
  const walletId = ctx.match[1];
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) return ctx.answerCallbackQuery({ text: "Wallet not found." });

  await prisma.wallet.update({
    where: { id: walletId },
    data: { isActive: !wallet.isActive }
  });

  await ctx.answerCallbackQuery({ text: `Wallet ${wallet.label} toggled!` });
  
  // Refresh wallet view
  const user = (ctx as any).dbUser;
  const wallets = await prisma.wallet.findMany({ where: { userId: user.id } });
  let response = '👛 *Configured Trading Wallets:*\n\n';
  const keyboard = new InlineKeyboard();

  wallets.forEach((w, index) => {
    const statusIcon = w.isActive ? '🟢 [Active]' : '🔴 [Inactive]';
    response += `${index + 1}. *${w.label}*${statusIcon}\n   \`${w.address}\`\n\n`;
    keyboard.text(`🔑 Export #${index+1}`, `wallet_export_${w.id}`)
            .text(`⚡ Toggle #${index+1}`, `wallet_toggle_${w.id}`).row();
  });

  keyboard.text("🎲 Generate Fresh Wallet", "menu_generate_wallet").row()
          .text("➕ Import Key (/addwallet)", "menu_import_info").row()
          .text("🏠 Main Menu", "menu_main");

  await ctx.editMessageText(response, { parse_mode: 'Markdown', reply_markup: keyboard });
});

bot.callbackQuery('menu_import_info', async (ctx) => {
  await ctx.editMessageText(
    `📥 *Import Existing Private Key*\n\n` +
    `Send the following command directly in chat:\n` +
    `\`/addwallet 0xYourPrivateKeyHere MyCustomLabel\`\n\n` +
    `Keys are secured with AES-256-GCM encryption at rest.`,
    { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard }
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
      data: { userId: user.id, address: account.address, encryptedKey, label, isDefault, isActive: true },
    });

    await ctx.editMessageText(
      `🎉 *New Burner Wallet Generated!*\n\n` +
      `🏷 *Label:* ${label}\n` +
      `🔹 *Address:* \`${account.address}\`\n\n` +
      `🔑 *Private Key:* \`${rawPrivateKey}\`\n\n` +
      `⚠️ *Save this key securely!*`,
      { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard }
    );
  } catch (err: any) {
    await ctx.editMessageText(`❌ *Error:* \`${err.message}\``, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
  }
  await ctx.answerCallbackQuery();
});

// Full Chains Hub with checkmarks matching reference design
bot.callbackQuery('menu_chains', async (ctx) => {
  const user = (ctx as any).dbUser;
  const chains = await prisma.chainToggle.findMany({ where: { userId: user.id } });

  const keyboard = new InlineKeyboard();
  chains.forEach((c) => {
    const checkmark = c.enabled ? '✅' : '❌';
    keyboard.text(`${checkmark}${c.chainName.toUpperCase()}`, `toggle_chain_${c.chainName}`).row();
  });
  keyboard.text("🏠 Main Menu", "menu_main");

  await ctx.editMessageText(
    `⚙️ *Alert & Execution Subscriptions*\n\n` +
    `Tap any network below to toggle execution status instantly:`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
  await ctx.answerCallbackQuery();
});

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

  const chains = await prisma.chainToggle.findMany({ where: { userId: user.id } });
  const keyboard = new InlineKeyboard();
  chains.forEach((c) => {
    const checkmark = c.enabled ? '✅' : '❌';
    keyboard.text(`${checkmark}${c.chainName.toUpperCase()}`, `toggle_chain_${c.chainName}`).row();
  });
  keyboard.text("🏠 Main Menu", "menu_main");

  await ctx.editMessageText(`⚙️ *Alert & Execution Subscriptions*\n\nUpdated [${chainName.toUpperCase()}] status:`, {
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

  response += `*To add:* \`/addwhale <chain> <address> [label]\`\n*To remove:* \`/removewhale <address>\``;

  await ctx.editMessageText(response, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu_portfolio', async (ctx) => {
  const user = (ctx as any).dbUser;
  const wallets = await prisma.wallet.findMany({ where: { userId: user.id, isActive: true } });

  if (wallets.length === 0) {
    return ctx.editMessageText('🖼️ *Portfolio*\n\nNo active wallets connected.', { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
  }

  let report = '🖼️ *Live Portfolio Balance Summary (Active Wallets):*\n\n';
  for (const w of wallets) {
    report += `👛 *${w.label}* (\`${w.address.slice(0, 6)}...${w.address.slice(-4)}\`)\n`;
    try {
      const chain = getChainConfig('base');
      const client = createPublicClient({ chain, transport: http() });
      const balanceWei = await client.getBalance({ address: w.address as Address });
      report += `   🔹 Balance: *${formatEther(balanceWei)} ETH*\n\n`;
    } catch {
      report += `   🔹 Balance fetch error\n\n`;
    }
  }

  await ctx.editMessageText(report, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu_scan', async (ctx) => {
  await ctx.editMessageText(
    `🔍 *Contract Scanner & Security Audit*\n\n` +
    `Send the scan command in chat to audit any contract:\n` +
    `\`/scan <chain> <contractAddress>\`\n\n` +
    `The engine checks bytecode deployment, function signatures (mint/claim), and risk parameters.`,
    { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard }
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu_watchlist', async (ctx) => {
  await ctx.editMessageText(
    `👁️ *Active Watchlist*\n\nNo active target contracts staged in watchlist.`,
    { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard }
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu_settings', async (ctx) => {
  const user = (ctx as any).dbUser;
  const s = user.settings;

  const keyboard = new InlineKeyboard()
    .text("⚡ Priority: 2 Gwei", "set_gwei_2").text("⚡ Priority: 5 Gwei", "set_gwei_5").row()
    .text("⚡ Priority: 10 Gwei", "set_gwei_10").row()
    .text("🛡️ Set ETH Cap: 0.02", "set_cap_0.02").text("🛡️ Set ETH Cap: 0.05", "set_cap_0.05").row()
    .text("🏠 Main Menu", "menu_main");

  await ctx.editMessageText(
    `🛡️ *Interactive Gas & Safety Settings*\n\n` +
    `🔹 *Priority Gwei Tip:* ${s?.priorityGwei || '3.0'} Gwei\n` +
    `🔹 *Max ETH Cap / Budget:* ${s?.maxEthCap || '0.05'} ETH\n` +
    `🔹 *Slippage Tolerance:* ${s?.slippageTolerance || 1}%\n\n` +
    `*Custom ETH Cap command:* \`/setcap <eth_amount>\``,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^set_gwei_(\d+)$/, async (ctx) => {
  const user = (ctx as any).dbUser;
  const gweiVal = ctx.match[1] + '.0';
  await prisma.userSettings.update({ where: { userId: user.id }, data: { priorityGwei: gweiVal } });
  await ctx.answerCallbackQuery({ text: `Priority updated to ${gweiVal} Gwei` });
  
  const updated = await prisma.user.findUnique({ where: { id: user.id }, include: { settings: true } });
  const s = updated?.settings;
  const keyboard = new InlineKeyboard()
    .text("⚡ Priority: 2 Gwei", "set_gwei_2").text("⚡ Priority: 5 Gwei", "set_gwei_5").row()
    .text("⚡ Priority: 10 Gwei", "set_gwei_10").row()
    .text("🏠 Main Menu", "menu_main");

  await ctx.editMessageText(
    `🛡️ *Interactive Gas & Safety Settings*\n\n` +
    `🔹 *Priority Gwei Tip:* ${s?.priorityGwei} Gwei\n` +
    `🔹 *Max ETH Cap:* ${s?.maxEthCap} ETH\n\n` +
    `✅ Successfully updated priority tip!`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
});

bot.callbackQuery(/^set_cap_(.+)$/, async (ctx) => {
  const user = (ctx as any).dbUser;
  const capVal = ctx.match[1];
  await prisma.userSettings.update({ where: { userId: user.id }, data: { maxEthCap: capVal } });
  await ctx.answerCallbackQuery({ text: `Max ETH cap set to ${capVal} ETH` });

  const updated = await prisma.user.findUnique({ where: { id: user.id }, include: { settings: true } });
  const s = updated?.settings;
  const keyboard = new InlineKeyboard()
    .text("🛡️ Set ETH Cap: 0.02", "set_cap_0.02").text("🛡️ Set ETH Cap: 0.05", "set_cap_0.05").row()
    .text("🏠 Main Menu", "menu_main");

  await ctx.editMessageText(
    `🛡️ *Interactive Gas & Safety Settings*\n\n` +
    `🔹 *Priority Gwei Tip:* ${s?.priorityGwei} Gwei\n` +
    `🔹 *Max ETH Cap:* ${s?.maxEthCap} ETH\n\n` +
    `✅ Successfully updated Max ETH safety cap!`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
});

bot.callbackQuery('menu_help', async (ctx) => {
  await ctx.editMessageText(
    `📖 *ApexBee User Guide*\n\n` +
    `• *Free Mint Sniper:* Detects and auto-mints zero-wei contracts instantly.\n` +
    `• *Manual Mint:* Use \`/snipe <chain> <contract> <valueWei>\` to claim WL allocations.\n` +
    `• *Security Audit:* Use \`/scan <chain> <contract>\` to verify bytecode.\n` +
    `• *Gas Safety:* Set max ETH caps to prevent high-fee wallet drains.`,
    { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard }
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu_toggle_automint', async (ctx) => {
  const user = (ctx as any).dbUser;
  const newStatus = !(user.settings?.autoMintActive || false);
  await prisma.userSettings.update({ where: { userId: user.id }, data: { autoMintActive: newStatus } });
  await ctx.answerCallbackQuery({ text: `Auto-Mint is now ${newStatus ? 'ON' : 'OFF'}` });
  await ctx.editMessageText(
    `🤖 *ApexBee Professional Sniper Engine*\n\nSelect an option below:`,
    { parse_mode: 'Markdown', reply_markup: getMainMenuKeyboard(newStatus) }
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
      data: { userId: user.id, address: account.address, encryptedKey, label, isDefault: existingCount === 0, isActive: true },
    });
    await ctx.reply(`✅ *Wallet Stored Successfully!*\nAddress: \`${account.address}\``, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
  } catch (err: any) {
    await ctx.reply(`❌ *Error:* \`${err.message}\``, { parse_mode: 'Markdown' });
  }
});

bot.command('setcap', async (ctx) => {
  const user = (ctx as any).dbUser;
  const cap = ctx.match?.trim();
  if (!cap) return ctx.reply('⚠️ *Usage:* `/setcap 0.05`', { parse_mode: 'Markdown' });

  await prisma.userSettings.update({ where: { userId: user.id }, data: { maxEthCap: cap } });
  await ctx.reply(`✅ *Max ETH Safety Cap set to:* \`${cap} ETH\``, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
});

bot.command('scan', async (ctx) => {
  const input = ctx.match?.trim() || '';
  const parts = input.split(' ');
  if (parts.length < 2) return ctx.reply('⚠️ *Usage:* `/scan <chain> <contractAddress>`', { parse_mode: 'Markdown' });

  const [chainName, contractAddress] = parts;
  await ctx.reply(`🔍 *Running Deep Security Audit on [${chainName.toUpperCase()}]...*`);

  const audit = await runSecurityAudit(chainName, contractAddress);
  let report = `🛡️ *Security Audit Report*\n\n`;
  report += `🔹 *Target:* \`${contractAddress}\`\n`;
  report += `🔹 *Has Bytecode:* ${audit.hasBytecode ? '✅ Yes' : '❌ No'}\n`;
  report += `🔹 *Risk Level:* *${audit.riskLevel}*\n`;
  if (audit.detectedFunctions.length > 0) {
    report += `🔹 *Detected Signatures:* ${audit.detectedFunctions.join(', ')}\n`;
  }
  if (audit.error) {
    report += `⚠️ *Error:* ${audit.error}`;
  }

  await ctx.reply(report, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
});

bot.command('snipe', async (ctx) => {
  const user = (ctx as any).dbUser;
  const input = ctx.match?.trim() || '';
  const args = input.split(' ');
  if (args.length < 2) return ctx.reply('⚠️ *Usage:* `/snipe <chain> <contractAddress> [valueWei]`', { parse_mode: 'Markdown' });

  const [chainName, contractAddress, valueWeiStr = '0'] = args;
  const wallet = await prisma.wallet.findFirst({ where: { userId: user.id, isDefault: true, isActive: true } });
  if (!wallet) return ctx.reply('❌ No active default wallet configured.', { parse_mode: 'Markdown' });

  await ctx.reply(`🚀 *Executing WL / Manual Mint on [${chainName.toUpperCase()}]*...`, { parse_mode: 'Markdown' });

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

bot.catch((err) => {
  console.error(`[TelegramBot] Error:`, err.error);
});

export function startTelegramBot() {
  bot.start();
  console.log('[TelegramBot] 🤖 Professional ApexBee Engine online.');
}
