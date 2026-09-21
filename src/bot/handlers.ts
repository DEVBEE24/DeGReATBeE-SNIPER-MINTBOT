import { InlineKeyboard } from 'grammy';
import { PrismaClient } from '@prisma/client';
import { decryptPrivateKey } from '../core/crypto';
import { createWalletForUser } from '../core/wallet';
import { backToMenuKeyboard, getMainDashboardKeyboard, getChainSubscriptionsKeyboard } from './keyboard';

const prisma = new PrismaClient();

const SUPPORTED_NETWORKS = [
  { chainName: 'base', name: 'Base' },
  { chainName: 'ethereum', name: 'Ethereum' },
  { chainName: 'robinhood', name: 'Robinhood Chain' },
  { chainName: 'ink', name: 'Ink' },
  { chainName: 'arc', name: 'Arc' },
];

export function registerHandlers(bot: any) {
  // Main Menu Callback
  bot.callbackQuery('menu_main', async (ctx: any) => {
    const user = ctx.dbUser;
    await ctx.editMessageText(`🤖 *ApexBee Professional Sniper Engine*\n\nSelect an option below:`, {
      parse_mode: 'Markdown',
      reply_markup: getMainDashboardKeyboard(user.settings?.autoMintActive || false),
    });
    await ctx.answerCallbackQuery();
  });

  // Wallets Hub (List with active toggles & exports)
  bot.callbackQuery('menu_wallets', async (ctx: any) => {
    const user = ctx.dbUser;
    const wallets = await prisma.wallet.findMany({ where: { userId: user.id } });

    let response = '👛 *Configured Trading Wallets:*\n\n';
    const keyboard = new InlineKeyboard();

    if (wallets.length === 0) {
      response += '⚠️ No wallets found. Generate or import one below.';
    } else {
      wallets.forEach((w: any, index: number) => {
        const statusIcon = w.isActive ? '🟢 [Active]' : '🔴 [Inactive]';
        response += `${index + 1}. *${w.label}*${statusIcon}\n   \`${w.address}\`\n\n`;
        keyboard.text(`🔑 Export #${index + 1}`, `wallet_export_${w.id}`)
                .text(`⚡ Toggle #${index + 1}`, `wallet_toggle_${w.id}`).row();
      });
    }

    keyboard.text("🎲 Generate Fresh Wallet", "menu_generate_wallet").row()
            .text("➕ Import Key (/addwallet)", "menu_import_info").row()
            .text("🏠 Main Menu", "menu_main");

    await ctx.editMessageText(response, { parse_mode: 'Markdown', reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  });

  // Wallet Toggle Handler (Active/Inactive)
  bot.callbackQuery(/^wallet_toggle_(.+)$/, async (ctx: any) => {
    const walletId = ctx.match[1];
    const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) return ctx.answerCallbackQuery({ text: "Wallet not found." });

    await prisma.wallet.update({
      where: { id: walletId },
      data: { isActive: !wallet.isActive }
    });
    await ctx.answerCallbackQuery({ text: `Wallet status updated!` });
    
    const user = ctx.dbUser;
    const wallets = await prisma.wallet.findMany({ where: { userId: user.id } });
    let response = '👛 *Configured Trading Wallets:*\n\n';
    const keyboard = new InlineKeyboard();

    wallets.forEach((w: any, index: number) => {
      const statusIcon = w.isActive ? '🟢 [Active]' : '🔴 [Inactive]';
      response += `${index + 1}. *${w.label}*${statusIcon}\n   \`${w.address}\`\n\n`;
      keyboard.text(`🔑 Export #${index + 1}`, `wallet_export_${w.id}`)
              .text(`⚡ Toggle #${index + 1}`, `wallet_toggle_${w.id}`).row();
    });

    keyboard.text("🎲 Generate Fresh Wallet", "menu_generate_wallet").row()
            .text("➕ Import Key (/addwallet)", "menu_import_info").row()
            .text("🏠 Main Menu", "menu_main");

    await ctx.editMessageText(response, { parse_mode: 'Markdown', reply_markup: keyboard });
  });

  // Wallet Export Handler
  bot.callbackQuery(/^wallet_export_(.+)$/, async (ctx: any) => {
    const walletId = ctx.match[1];
    const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) return ctx.answerCallbackQuery({ text: "Wallet not found." });

    const decryptedKey = decryptPrivateKey(wallet.encryptedKey);
    await ctx.reply(
      `🔑 *Private Key for [${wallet.label}]*\n\nAddress: \`${wallet.address}\`\nKey: \`${decryptedKey}\`\n\n⚠️ *Keep secure! Delete this message after copying.*`,
      { parse_mode: 'Markdown' }
    );
    await ctx.answerCallbackQuery({ text: "Exported successfully" });
  });

  bot.callbackQuery('menu_import_info', async (ctx: any) => {
    await ctx.editMessageText(
      `📥 *Import Existing Private Key*\n\n` +
      `Send the following command directly in chat:\n` +
      `\`/addwallet 0xYourPrivateKeyHere MyCustomLabel\`\n\n` +
      `Keys are secured with AES-256-GCM encryption at rest.`,
      { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard }
    );
    await ctx.answerCallbackQuery();
  });

  // Generate Fresh Wallet Callback
  bot.callbackQuery('menu_generate_wallet', async (ctx: any) => {
    const user = ctx.dbUser;
    try {
      const wallet = await createWalletForUser(user.id);
      const decryptedKey = decryptPrivateKey(wallet.encryptedKey);
      await ctx.editMessageText(
        `🎉 *New Burner Wallet Generated!*\n\n` +
        `🏷 *Label:* ${wallet.label}\n` +
        `🔹 *Address:* \`${wallet.address}\`\n\n` +
        `🔑 *Private Key:* \`${decryptedKey}\`\n\n` +
        `⚠️ *Save this key securely!*`,
        { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard }
      );
    } catch (err: any) {
      await ctx.editMessageText(`❌ *Error:* \`${err.message}\``, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
    }
    await ctx.answerCallbackQuery();
  });

  // Self-Healing Chains Hub (Checkmark Toggles)
  bot.callbackQuery('menu_chains', async (ctx: any) => {
    const user = ctx.dbUser;
    const chainStates = [];

    for (const net of SUPPORTED_NETWORKS) {
      let toggle = await prisma.chainToggle.findUnique({
        where: { userId_chainName: { userId: user.id, chainName: net.chainName } }
      });
      if (!toggle) {
        toggle = await prisma.chainToggle.create({
          data: { userId: user.id, chainName: net.chainName, enabled: true }
        });
      }
      chainStates.push({ chainName: net.chainName, enabled: toggle.enabled });
    }

    await ctx.editMessageText(
      `⚙️ *Alert & Execution Subscriptions*\n\nTap any network below to toggle execution status instantly:`,
      { parse_mode: 'Markdown', reply_markup: getChainSubscriptionsKeyboard(chainStates) }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^toggle_chain_(.+)$/, async (ctx: any) => {
    const user = ctx.dbUser;
    const chainName = ctx.match[1];

    const current = await prisma.chainToggle.findUnique({
      where: { userId_chainName: { userId: user.id, chainName } }
    });

    if (current) {
      await prisma.chainToggle.update({
        where: { id: current.id },
        data: { enabled: !current.enabled }
      });
    } else {
      await prisma.chainToggle.create({
        data: { userId: user.id, chainName, enabled: true }
      });
    }

    const chainStates = [];
    for (const net of SUPPORTED_NETWORKS) {
      let toggle = await prisma.chainToggle.findUnique({
        where: { userId_chainName: { userId: user.id, chainName: net.chainName } }
      });
      if (!toggle) {
        toggle = await prisma.chainToggle.create({
          data: { userId: user.id, chainName: net.chainName, enabled: true }
        });
      }
      chainStates.push({ chainName: net.chainName, enabled: toggle.enabled });
    }

    await ctx.editMessageText(`⚙️ *Alert & Execution Subscriptions*\n\nUpdated [${chainName.toUpperCase()}] status:`, {
      parse_mode: 'Markdown',
      reply_markup: getChainSubscriptionsKeyboard(chainStates),
    });
    await ctx.answerCallbackQuery({ text: `Toggled ${chainName}` });
  });

  // Tracking Hub
  bot.callbackQuery('menu_tracking', async (ctx: any) => {
    const user = ctx.dbUser;
    const targets = await prisma.whaleTarget.findMany({ where: { userId: user.id } });

    let response = '🎯 *Whale Copy-Snipe Tracking Hub*\n\n';
    if (targets.length === 0) {
      response += '⚠️ No active whale wallets tracked.\n\n';
    } else {
      targets.forEach((t: any, i: number) => {
        response += `${i + 1}. *${t.label}* (${t.chainName.toUpperCase()})\n   \`${t.address}\`\n\n`;
      });
    }

    response += `*To add:* \`/addwhale <chain> <address> [label]\`\n*To remove:* \`/removewhale <address>\``;

    await ctx.editMessageText(response, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
    await ctx.answerCallbackQuery();
  });

  // Portfolio Summary
  bot.callbackQuery('menu_portfolio', async (ctx: any) => {
    await ctx.editMessageText(
      `🖼️ *Portfolio View*\n\nUse \`/portfolio\` or check connected active wallets.`,
      { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard }
    );
    await ctx.answerCallbackQuery();
  });

  // Scan Contract Hub
  bot.callbackQuery('menu_scan', async (ctx: any) => {
    await ctx.editMessageText(
      `🔍 *Contract Scanner & Security Audit*\n\n` +
      `Send command:\n\`/scan <chain> <contractAddress>\`\n\n` +
      `Audits bytecode, detects mint/claim signatures, and assesses risk.`,
      { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard }
    );
    await ctx.answerCallbackQuery();
  });

  // Watchlist
  bot.callbackQuery('menu_watchlist', async (ctx: any) => {
    await ctx.editMessageText(
      `👁️ *Active Watchlist*\n\nNo active target contracts staged in watchlist.`,
      { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard }
    );
    await ctx.answerCallbackQuery();
  });

  // Settings & Gas Configuration Panel
  bot.callbackQuery('menu_settings', async (ctx: any) => {
    const user = ctx.dbUser;
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

  bot.callbackQuery(/^set_gwei_(\d+)$/, async (ctx: any) => {
    const user = ctx.dbUser;
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

  bot.callbackQuery(/^set_cap_(.+)$/, async (ctx: any) => {
    const user = ctx.dbUser;
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

  bot.callbackQuery('menu_help', async (ctx: any) => {
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

  bot.callbackQuery('menu_toggle_automint', async (ctx: any) => {
    const user = ctx.dbUser;
    const newStatus = !(user.settings?.autoMintActive || false);
    await prisma.userSettings.update({ where: { userId: user.id }, data: { autoMintActive: newStatus } });
    await ctx.answerCallbackQuery({ text: `Auto-Mint is now ${newStatus ? 'ON' : 'OFF'}` });
    await ctx.editMessageText(
      `🤖 *ApexBee Professional Sniper Engine*\n\nSelect an option below:`,
      { parse_mode: 'Markdown', reply_markup: getMainDashboardKeyboard(newStatus) }
    );
  });
}
