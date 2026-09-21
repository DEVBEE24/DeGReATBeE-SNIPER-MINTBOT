import { InlineKeyboard } from 'grammy';
import { pool, query, queryOne } from '../config/database';
import { decryptPrivateKey } from '../core/crypto';
import { createWalletForUser } from '../core/wallet';
import { backToMenuKeyboard, getMainDashboardKeyboard, getChainSubscriptionsKeyboard, getWalletListKeyboard, getSettingsKeyboard, getScheduleListKeyboard, getWatchlistKeyboard } from './keyboards';
import { runSecurityAudit } from '../core/scanner';
import { dispatchMintTransaction, parseWeiValue } from '../core/dispatcher';
import { fetchWalletBalances, formatPortfolioMessage } from '../core/portfolio';
import { getSchedulesByUser, cancelSchedule } from '../core/scheduler';
import { UserWithRelations } from '../types/database';
import { Address } from 'viem';
import { SUPPORTED_NETWORKS } from '../config/chains';

export function registerHandlers(bot: any) {
  // Main Menu
  bot.callbackQuery('menu_main', async (ctx: any) => {
    const user: UserWithRelations = ctx.dbUser;
    await ctx.editMessageText(`🤖 *ApexBee Professional Sniper Engine*\n\nSelect an option below:`, {
      parse_mode: 'Markdown',
      reply_markup: getMainDashboardKeyboard(user.settings?.auto_mint_active || false),
    });
    await ctx.answerCallbackQuery();
  });

  // Wallets Hub
  bot.callbackQuery('menu_wallets', async (ctx: any) => {
    const user: UserWithRelations = ctx.dbUser;
    const wallets = await query<any>(
      `SELECT * FROM wallets WHERE user_id = $1 ORDER BY created_at ASC`,
      [user.id]
    );

    let response = '👛 *Configured Trading Wallets:*\n\n';
    if (wallets.length === 0) {
      response += '⚠️ No wallets found. Generate or import one below.';
    } else {
      wallets.forEach((w: any, index: number) => {
        const statusIcon = w.is_active ? '🟢 [Active]' : '🔴 [Inactive]';
        const defaultIcon = w.is_default ? '⭐' : '';
        response += `${index + 1}. ${defaultIcon} *${w.label}* ${statusIcon}\n   \`${w.address}\`\n\n`;
      });
    }

    await ctx.editMessageText(response, { parse_mode: 'Markdown', reply_markup: getWalletListKeyboard(wallets) });
    await ctx.answerCallbackQuery();
  });

  // Wallet Toggle
  bot.callbackQuery(/^wallet_toggle_(.+)$/, async (ctx: any) => {
    const walletId = ctx.match[1];
    const user: UserWithRelations = ctx.dbUser;

    const wallet = await queryOne<any>(
      `SELECT * FROM wallets WHERE id = $1 LIMIT 1`,
      [walletId]
    );

    if (!wallet) return ctx.answerCallbackQuery({ text: 'Wallet not found.' });

    await pool.query(
      `UPDATE wallets SET is_active = $2 WHERE id = $1`,
      [walletId, !wallet.is_active]
    );

    await ctx.answerCallbackQuery({ text: 'Wallet status updated!' });

    const wallets = await query<any>(
      `SELECT * FROM wallets WHERE user_id = $1 ORDER BY created_at ASC`,
      [user.id]
    );

    let response = '👛 *Configured Trading Wallets:*\n\n';
    wallets.forEach((w: any, index: number) => {
      const statusIcon = w.is_active ? '🟢 [Active]' : '🔴 [Inactive]';
      const defaultIcon = w.is_default ? '⭐' : '';
      response += `${index + 1}. ${defaultIcon} *${w.label}* ${statusIcon}\n   \`${w.address}\`\n\n`;
    });

    await ctx.editMessageText(response, { parse_mode: 'Markdown', reply_markup: getWalletListKeyboard(wallets) });
  });

  // Wallet Export
  bot.callbackQuery(/^wallet_export_(.+)$/, async (ctx: any) => {
    const walletId = ctx.match[1];
    const wallet = await queryOne<any>(
      `SELECT * FROM wallets WHERE id = $1 LIMIT 1`,
      [walletId]
    );

    if (!wallet) return ctx.answerCallbackQuery({ text: 'Wallet not found.' });

    const decryptedKey = decryptPrivateKey(wallet.encrypted_key);
    await ctx.reply(
      `🔑 *Private Key for [${wallet.label}]*\n\nAddress: \`${wallet.address}\`\nKey: \`${decryptedKey}\`\n\n⚠️ *Keep secure! Delete this message after copying.*`,
      { parse_mode: 'Markdown' }
    );
    await ctx.answerCallbackQuery({ text: 'Exported successfully' });
  });

  // Import Info
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

  // Generate Fresh Wallet
  bot.callbackQuery('menu_generate_wallet', async (ctx: any) => {
    const user: UserWithRelations = ctx.dbUser;
    try {
      const wallet = await createWalletForUser(user.id);
      const decryptedKey = decryptPrivateKey(wallet.encrypted_key);
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

  // Chains Hub - concurrent seeding
  bot.callbackQuery('menu_chains', async (ctx: any) => {
    const user: UserWithRelations = ctx.dbUser;

    await Promise.all(
      SUPPORTED_NETWORKS.map((net) =>
        pool.query(
          `INSERT INTO chain_toggles (user_id, chain_name, enabled)
           VALUES ($1, $2, true)
           ON CONFLICT (user_id, chain_name) DO NOTHING`,
          [user.id, net.chainName]
        )
      )
    );

    const chains = await query<any>(
      `SELECT * FROM chain_toggles WHERE user_id = $1 ORDER BY chain_name ASC`,
      [user.id]
    );

    await ctx.editMessageText(
      `⚙️ *Alert & Execution Subscriptions*\n\nTap any network below to toggle execution status instantly:`,
      { parse_mode: 'Markdown', reply_markup: getChainSubscriptionsKeyboard(chains) }
    );
    await ctx.answerCallbackQuery();
  });

  // Toggle Chain
  bot.callbackQuery(/^toggle_chain_(.+)$/, async (ctx: any) => {
    const user: UserWithRelations = ctx.dbUser;
    const chainName = ctx.match[1];

    const current = await queryOne<any>(
      `SELECT * FROM chain_toggles WHERE user_id = $1 AND chain_name = $2 LIMIT 1`,
      [user.id, chainName]
    );

    if (current) {
      await pool.query(
        `UPDATE chain_toggles SET enabled = $3 WHERE id = $1 AND user_id = $2`,
        [current.id, user.id, !current.enabled]
      );
    } else {
      await pool.query(
        `INSERT INTO chain_toggles (user_id, chain_name, enabled) VALUES ($1, $2, true)`,
        [user.id, chainName]
      );
    }

    const chains = await query<any>(
      `SELECT * FROM chain_toggles WHERE user_id = $1 ORDER BY chain_name ASC`,
      [user.id]
    );

    await ctx.editMessageText(`⚙️ *Alert & Execution Subscriptions*\n\nUpdated [${chainName.toUpperCase()}] status:`, {
      parse_mode: 'Markdown',
      reply_markup: getChainSubscriptionsKeyboard(chains),
    });
    await ctx.answerCallbackQuery({ text: `Toggled ${chainName}` });
  });

  // Tracking Hub
  bot.callbackQuery('menu_tracking', async (ctx: any) => {
    const user: UserWithRelations = ctx.dbUser;
    const targets = await query<any>(
      `SELECT * FROM whale_targets WHERE user_id = $1 ORDER BY created_at ASC`,
      [user.id]
    );

    let response = '🎯 *Whale Copy-Snipe Tracking Hub*\n\n';
    if (targets.length === 0) {
      response += '⚠️ No active whale wallets tracked.\n\n';
    } else {
      targets.forEach((t: any, i: number) => {
        response += `${i + 1}. *${t.label}* (${t.chain_name.toUpperCase()})\n   \`${t.address}\`\n\n`;
      });
    }

    response += `*To add:* \`/addwhale <chain> <address> [label]\`\n*To remove:* \`/removewhale <address>\``;

    await ctx.editMessageText(response, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
    await ctx.answerCallbackQuery();
  });

  // Portfolio - live balance fetching
  bot.callbackQuery('menu_portfolio', async (ctx: any) => {
    const user: UserWithRelations = ctx.dbUser;
    try {
      const chains = user.chain_toggles || [];
      const balances = await fetchWalletBalances(user.id, chains);
      const msg = formatPortfolioMessage(balances);
      await ctx.editMessageText(msg, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
    } catch (err: any) {
      await ctx.editMessageText(`❌ *Error:* \`${err.message}\``, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
    }
    await ctx.answerCallbackQuery();
  });

  // Scan Contract Hub
  bot.callbackQuery('menu_scan', async (ctx: any) => {
    await ctx.editMessageText(
      `🔍 *Contract Scanner & Security Audit*\n\n` +
      `Send command:\n\`/scan <chain> <contractAddress>\`\n\n` +
      `Or simply paste any contract address (0x...) and the bot will auto-detect the chain and run an audit.\n\n` +
      `Audits bytecode, detects mint/claim signatures, checks for honeypots, and assesses risk.`,
      { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard }
    );
    await ctx.answerCallbackQuery();
  });

  // Watchlist
  bot.callbackQuery('menu_watchlist', async (ctx: any) => {
    const user: UserWithRelations = ctx.dbUser;
    const targets = await query<any>(
      `SELECT * FROM watchlist_targets WHERE user_id = $1 ORDER BY created_at ASC`,
      [user.id]
    );

    let response = '👁️ *Active Watchlist*\n\n';
    if (targets.length === 0) {
      response += 'No active target contracts in watchlist.\n\n';
    } else {
      targets.forEach((t: any, i: number) => {
        response += `${i + 1}. *${t.label}* (${t.chain_name.toUpperCase()})\n   \`${t.contract_address}\`\n`;
        if (t.last_risk_level) response += `   Risk: ${t.last_risk_level}\n`;
        response += '\n';
      });
    }

    response += `*To add:* \`/watchlist <chain> <contractAddress> [label]\``;

    await ctx.editMessageText(response, { parse_mode: 'Markdown', reply_markup: getWatchlistKeyboard(targets) });
    await ctx.answerCallbackQuery();
  });

  // Watchlist Remove
  bot.callbackQuery(/^watchlist_remove_(.+)$/, async (ctx: any) => {
    const targetId = ctx.match[1];
    const user: UserWithRelations = ctx.dbUser;

    await pool.query(
      `DELETE FROM watchlist_targets WHERE id = $1 AND user_id = $2`,
      [targetId, user.id]
    );

    const targets = await query<any>(
      `SELECT * FROM watchlist_targets WHERE user_id = $1 ORDER BY created_at ASC`,
      [user.id]
    );

    let response = '👁️ *Active Watchlist*\n\n';
    if (targets.length === 0) {
      response += 'No active target contracts in watchlist.\n\n';
    } else {
      targets.forEach((t: any, i: number) => {
        response += `${i + 1}. *${t.label}* (${t.chain_name.toUpperCase()})\n   \`${t.contract_address}\`\n\n`;
      });
    }
    response += `*To add:* \`/watchlist <chain> <contractAddress> [label]\``;

    await ctx.editMessageText(response, { parse_mode: 'Markdown', reply_markup: getWatchlistKeyboard(targets) });
    await ctx.answerCallbackQuery({ text: 'Removed from watchlist' });
  });

  // Watchlist Detail (re-scan)
  bot.callbackQuery(/^watchlist_detail_(.+)$/, async (ctx: any) => {
    const targetId = ctx.match[1];
    const target = await queryOne<any>(
      `SELECT * FROM watchlist_targets WHERE id = $1 LIMIT 1`,
      [targetId]
    );

    if (!target) return ctx.answerCallbackQuery({ text: 'Target not found.' });

    await ctx.answerCallbackQuery({ text: 'Scanning...' });
    const audit = await runSecurityAudit(target.chain_name, target.contract_address);

    await pool.query(
      `UPDATE watchlist_targets SET last_risk_level = $2, last_scanned_at = $3 WHERE id = $1`,
      [targetId, audit.riskLevel, new Date().toISOString()]
    );

    let report = `🛡️ *Watchlist Target Re-Scanned*\n\n`;
    report += `🔹 *Target:* \`${target.contract_address}\`\n`;
    report += `🔹 *Chain:* ${target.chain_name.toUpperCase()}\n`;
    report += `🔹 *Risk Level:* *${audit.riskLevel}*\n`;
    if (audit.isHoneypot) report += `🚨 *HONEYPOT DETECTED!*\n`;
    if (audit.detectedFunctions.length > 0) report += `🔹 *Functions:* ${audit.detectedFunctions.join(', ')}\n`;
    if (audit.error) report += `⚠️ *Error:* ${audit.error}`;

    await ctx.reply(report, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
  });

  // Schedules Hub
  bot.callbackQuery('menu_schedules', async (ctx: any) => {
    const user: UserWithRelations = ctx.dbUser;
    try {
      const schedules = await getSchedulesByUser(user.id);
      let response = '⏰ *Scheduled Mints:*\n\n';
      if (schedules.length === 0) {
        response += 'No scheduled mints found.\n\n';
        response += `*Usage:* \`/schedule <chain> <contract> <function> <valueEth> <timestamp | blockNumber>\``;
      } else {
        schedules.forEach((s, i) => {
          const statusIcon = s.status === 'pending' ? '⏳' : s.status === 'completed' ? '✅' : s.status === 'failed' ? '❌' : '🔄';
          response += `${i + 1}. ${statusIcon} *${s.chain_name.toUpperCase()}* - \`${s.contract_address.slice(0, 10)}...\`\n`;
          if (s.execute_at) response += `   ⏰ ${s.execute_at}\n`;
          if (s.target_block) response += `   📦 Block #${s.target_block}\n`;
          if (s.tx_hash) response += `   ✅ Tx: \`${s.tx_hash.slice(0, 20)}...\`\n`;
          response += '\n';
        });
      }
      await ctx.editMessageText(response, { parse_mode: 'Markdown', reply_markup: getScheduleListKeyboard(schedules) });
    } catch (err: any) {
      await ctx.editMessageText(`❌ *Error:* \`${err.message}\``, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
    }
    await ctx.answerCallbackQuery();
  });

  // Schedule Detail (cancel)
  bot.callbackQuery(/^schedule_detail_(.+)$/, async (ctx: any) => {
    const scheduleId = ctx.match[1];
    const schedule = await queryOne<any>(
      `SELECT * FROM mint_schedules WHERE id = $1 LIMIT 1`,
      [scheduleId]
    );

    if (!schedule) return ctx.answerCallbackQuery({ text: 'Schedule not found.' });

    let msg = `⏰ *Schedule Details*\n\n`;
    msg += `🔹 *Chain:* ${schedule.chain_name.toUpperCase()}\n`;
    msg += `🔹 *Contract:* \`${schedule.contract_address}\`\n`;
    msg += `🔹 *Function:* ${schedule.function_name}\n`;
    msg += `🔹 *Value:* ${schedule.value_wei} wei\n`;
    msg += `🔹 *Status:* ${schedule.status}\n`;
    if (schedule.execute_at) msg += `🔹 *Execute At:* ${schedule.execute_at}\n`;
    if (schedule.target_block) msg += `🔹 *Target Block:* #${schedule.target_block}\n`;
    if (schedule.tx_hash) msg += `🔹 *Tx Hash:* \`${schedule.tx_hash}\`\n`;
    if (schedule.error_message) msg += `🔹 *Error:* ${schedule.error_message}\n`;

    const keyboard = new InlineKeyboard();
    if (schedule.status === 'pending') {
      keyboard.text('❌ Cancel Schedule', `schedule_cancel_${schedule.id}`).row();
    }
    keyboard.text('🏠 Main Menu', 'menu_main');

    await ctx.editMessageText(msg, { parse_mode: 'Markdown', reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  });

  // Schedule Cancel
  bot.callbackQuery(/^schedule_cancel_(.+)$/, async (ctx: any) => {
    const scheduleId = ctx.match[1];
    try {
      await cancelSchedule(scheduleId);
      await ctx.answerCallbackQuery({ text: 'Schedule cancelled!' });
      await ctx.editMessageText(`✅ *Schedule cancelled successfully.*`, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
    } catch (err: any) {
      await ctx.answerCallbackQuery({ text: `Error: ${err.message}` });
    }
  });

  // Settings & Gas Configuration Panel
  bot.callbackQuery('menu_settings', async (ctx: any) => {
    const user: UserWithRelations = ctx.dbUser;
    const s = user.settings;

    await ctx.editMessageText(
      `🛡️ *Interactive Gas & Safety Settings*\n\n` +
      `🔹 *Priority Gwei Tip:* ${s?.priority_gwei || '3.0'} Gwei\n` +
      `🔹 *Max ETH Cap / Budget:* ${s?.max_eth_cap || '0.05'} ETH\n` +
      `🔹 *Slippage Tolerance:* ${s?.slippage_tolerance || 1}%\n` +
      `🔹 *Auto-Mint:* ${s?.auto_mint_active ? 'ON' : 'OFF'}\n\n` +
      `*Custom ETH Cap command:* \`/setcap <eth_amount>\``,
      { parse_mode: 'Markdown', reply_markup: getSettingsKeyboard() }
    );
    await ctx.answerCallbackQuery();
  });

  // Set Gwei
  bot.callbackQuery(/^set_gwei_(\d+)$/, async (ctx: any) => {
    const user: UserWithRelations = ctx.dbUser;
    const gweiVal = ctx.match[1] + '.0';
    await pool.query(
      `UPDATE user_settings SET priority_gwei = $2 WHERE user_id = $1`,
      [user.id, gweiVal]
    );
    await ctx.answerCallbackQuery({ text: `Priority updated to ${gweiVal} Gwei` });

    const updated = await queryOne<any>(
      `SELECT * FROM user_settings WHERE user_id = $1 LIMIT 1`,
      [user.id]
    );

    await ctx.editMessageText(
      `🛡️ *Interactive Gas & Safety Settings*\n\n` +
      `🔹 *Priority Gwei Tip:* ${updated?.priority_gwei} Gwei\n` +
      `🔹 *Max ETH Cap:* ${updated?.max_eth_cap} ETH\n\n` +
      `✅ Successfully updated priority tip!`,
      { parse_mode: 'Markdown', reply_markup: getSettingsKeyboard() }
    );
  });

  // Set Cap
  bot.callbackQuery(/^set_cap_(.+)$/, async (ctx: any) => {
    const user: UserWithRelations = ctx.dbUser;
    const capVal = ctx.match[1];
    await pool.query(
      `UPDATE user_settings SET max_eth_cap = $2 WHERE user_id = $1`,
      [user.id, capVal]
    );
    await ctx.answerCallbackQuery({ text: `Max ETH cap set to ${capVal} ETH` });

    const updated = await queryOne<any>(
      `SELECT * FROM user_settings WHERE user_id = $1 LIMIT 1`,
      [user.id]
    );

    await ctx.editMessageText(
      `🛡️ *Interactive Gas & Safety Settings*\n\n` +
      `🔹 *Priority Gwei Tip:* ${updated?.priority_gwei} Gwei\n` +
      `🔹 *Max ETH Cap:* ${updated?.max_eth_cap} ETH\n\n` +
      `✅ Successfully updated Max ETH safety cap!`,
      { parse_mode: 'Markdown', reply_markup: getSettingsKeyboard() }
    );
  });

  // Help
  bot.callbackQuery('menu_help', async (ctx: any) => {
    await ctx.editMessageText(
      `📖 *ApexBee User Guide*\n\n` +
      `• *Free Mint Sniper:* Detects and auto-mints zero-wei contracts instantly.\n` +
      `• *Manual Mint:* Use \`/snipe <chain> <contract> <valueEth>\` to claim WL allocations.\n` +
      `• *Auto-Scan:* Paste any 0x address in chat for auto-detection and audit.\n` +
      `• *Security Audit:* Use \`/scan <chain> <contract>\` to verify bytecode.\n` +
      `• *Mint Scheduling:* Use \`/schedule\` to stage delayed mints by timestamp or block.\n` +
      `• *Watchlist:* Track contracts with \`/watchlist <chain> <contract>\`\n` +
      `• *Portfolio:* Check live wallet balances across all chains.\n` +
      `• *Whale Tracking:* Add whale wallets with \`/addwhale\` for copy-minting.\n` +
      `• *Gas Safety:* Set max ETH caps to prevent high-fee wallet drains.`,
      { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard }
    );
    await ctx.answerCallbackQuery();
  });

  // Toggle Auto-Mint
  bot.callbackQuery('menu_toggle_automint', async (ctx: any) => {
    const user: UserWithRelations = ctx.dbUser;
    const newStatus = !(user.settings?.auto_mint_active || false);
    await pool.query(
      `UPDATE user_settings SET auto_mint_active = $2 WHERE user_id = $1`,
      [user.id, newStatus]
    );
    await ctx.answerCallbackQuery({ text: `Auto-Mint is now ${newStatus ? 'ON' : 'OFF'}` });
    await ctx.editMessageText(
      `🤖 *ApexBee Professional Sniper Engine*\n\nSelect an option below:`,
      { parse_mode: 'Markdown', reply_markup: getMainDashboardKeyboard(newStatus) }
    );
  });

  // === INTERCEPT CALLBACKS ===

  // Intercept: Full Scan
  bot.callbackQuery(/^intercept_scan_(.+)_(0x[a-fA-F0-9]{40})$/, async (ctx: any) => {
    const chainName = ctx.match[1];
    const address = ctx.match[2];
    await ctx.answerCallbackQuery({ text: 'Running full audit...' });

    const audit = await runSecurityAudit(chainName, address);
    let report = `🛡️ *Full Security Audit Report*\n\n`;
    report += `🔹 *Target:* \`${address}\`\n`;
    report += `🔹 *Chain:* ${chainName.toUpperCase()}\n`;
    report += `🔹 *Has Bytecode:* ${audit.hasBytecode ? '✅ Yes' : '❌ No'}\n`;
    report += `🔹 *Risk Level:* *${audit.riskLevel}*\n`;
    report += `🔹 *Bytecode Size:* ${audit.bytecodeSize} bytes\n`;
    if (audit.isHoneypot) report += `🚨 *HONEYPOT DETECTED!*\n`;
    if (audit.isProxy) report += `ℹ️ Proxy contract detected.\n`;
    if (audit.ownerMintOnly) report += `⚠️ Owner-only mint detected.\n`;
    if (audit.detectedFunctions.length > 0) report += `🔹 *Functions:* ${audit.detectedFunctions.join(', ')}\n`;
    if (audit.error) report += `⚠️ *Error:* ${audit.error}`;

    const keyboard = new InlineKeyboard()
      .text('🚀 Quick Mint (0 ETH)', `intercept_mint_${chainName}_${address}_0`)
      .text('💰 Mint (0.01 ETH)', `intercept_mint_${chainName}_${address}_0.01`).row()
      .text('⏰ Schedule Mint', `intercept_schedule_${chainName}_${address}`).row()
      .text('🏠 Main Menu', 'menu_main');

    await ctx.editMessageText(report, { parse_mode: 'Markdown', reply_markup: keyboard });
  });

  // Intercept: Add to Watchlist
  bot.callbackQuery(/^intercept_watch_(.+)_(0x[a-fA-F0-9]{40})$/, async (ctx: any) => {
    const chainName = ctx.match[1];
    const address = ctx.match[2];
    const user: UserWithRelations = ctx.dbUser;

    try {
      await pool.query(
        `INSERT INTO watchlist_targets (user_id, chain_name, contract_address, label) VALUES ($1, $2, $3, 'Auto-Detected')`,
        [user.id, chainName, address]
      );
    } catch (err: any) {
      if (!err.message.includes('duplicate') && !err.code?.includes('23505')) {
        await ctx.answerCallbackQuery({ text: `Error: ${err.message}` });
        return;
      }
    }

    await ctx.answerCallbackQuery({ text: 'Added to watchlist!' });
    await ctx.reply(`✅ *Added to Watchlist!*\n\`${address}\` on [${chainName.toUpperCase()}]`, {
      parse_mode: 'Markdown',
      reply_markup: backToMenuKeyboard,
    });
  });

  // Intercept: Quick Mint
  bot.callbackQuery(/^intercept_mint_(.+)_(0x[a-fA-F0-9]{40})_(.+)$/, async (ctx: any) => {
    const chainName = ctx.match[1];
    const address = ctx.match[2];
    const valueStr = ctx.match[3];
    const user: UserWithRelations = ctx.dbUser;

    const wallet = await queryOne<any>(
      `SELECT * FROM wallets WHERE user_id = $1 AND is_default = true AND is_active = true LIMIT 1`,
      [user.id]
    );

    if (!wallet) {
      await ctx.answerCallbackQuery({ text: 'No active default wallet!' });
      return;
    }

    await ctx.answerCallbackQuery({ text: 'Dispatching mint...' });
    await ctx.reply(`🚀 *Executing Quick Mint on [${chainName.toUpperCase()}]*...`, { parse_mode: 'Markdown' });

    const valueWei = parseWeiValue(valueStr);
    const result = await dispatchMintTransaction({
      encryptedPrivateKey: wallet.encrypted_key,
      chainName,
      contractAddress: address as Address,
      abi: [{ inputs: [], name: 'mint', outputs: [], stateMutability: 'payable', type: 'function' }],
      functionName: 'mint',
      args: [],
      valueWei,
      maxPriorityFeeGwei: user.settings?.priority_gwei || '3.0',
      maxFeePerGasGwei: '30.0',
      maxEthCap: user.settings?.max_eth_cap || '0.05',
    });

    if (result.success) {
      await ctx.reply(`✅ *Mint Executed Successfully!*\n\n🔗 *Tx Hash:* \`${result.txHash}\``, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
    } else {
      await ctx.reply(`❌ *Execution Failed:*\n\`${result.error}\``, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
    }
  });

  // Intercept: Schedule Mint
  bot.callbackQuery(/^intercept_schedule_(.+)_(0x[a-fA-F0-9]{40})$/, async (ctx: any) => {
    const chainName = ctx.match[1];
    const address = ctx.match[2];

    await ctx.answerCallbackQuery();
    await ctx.reply(
      `⏰ *Schedule Mint for ${address.slice(0, 10)}...*\n\n` +
      `Use the command:\n` +
      `\`/schedule ${chainName} ${address} mint 0 <timestampISO | blockNumber>\`\n\n` +
      `Example: \`/schedule ${chainName} ${address} mint 0 2026-12-31T23:59:00Z\`\n` +
      `Example: \`/schedule ${chainName} ${address} mint 0 19000000\``,
      { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard }
    );
  });
}
