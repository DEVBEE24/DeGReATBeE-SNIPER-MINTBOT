import { pool, queryOne } from '../config/database';
import { encryptPrivateKey } from '../core/crypto';
import { dispatchMintTransaction, parseWeiValue } from '../core/dispatcher';
import { runSecurityAudit } from '../core/scanner';
import { privateKeyToAccount } from 'viem/accounts';
import { Address } from 'viem';
import { backToMenuKeyboard, getMainDashboardKeyboard } from './keyboards';
import { createSchedule, getSchedulesByUser, cancelSchedule } from '../core/scheduler';
import { UserWithRelations } from '../types/database';

export function registerCommands(bot: any) {
  bot.command('start', async (ctx: any) => {
    const user: UserWithRelations = ctx.dbUser;
    const welcomeText =
      `🤖 *ApexBee Professional Sniper Engine*\n\n` +
      `Welcome back, *${user.username || 'Trader'}*!\n` +
      `Your high-speed multi-chain EVM mint & security auditing terminal is active.\n\n` +
      `Select an option below:`;

    await ctx.reply(welcomeText, {
      parse_mode: 'Markdown',
      reply_markup: getMainDashboardKeyboard(user.settings?.auto_mint_active || false),
    });
  });

  // /addwallet <private_key> [label]
  bot.command('addwallet', async (ctx: any) => {
    const user: UserWithRelations = ctx.dbUser;
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

      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS count FROM wallets WHERE user_id = $1`,
        [user.id]
      );
      const count = countResult.rows[0]?.count ?? 0;

      await pool.query(
        `INSERT INTO wallets (user_id, address, encrypted_key, label, is_default, is_active)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [user.id, account.address, encryptedKey, label, count === 0]
      );

      await ctx.reply(
        `✅ *Wallet Stored & Encrypted Successfully!*\n\n` +
        `🔹 *Address:* \`${account.address}\`\n` +
        `🏷 *Label:* ${label}`,
        { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard }
      );
    } catch (err: any) {
      await ctx.reply(`❌ *Failed to store wallet:* \`${err.message}\``, { parse_mode: 'Markdown' });
    }
  });

  // /setcap <eth_amount>
  bot.command('setcap', async (ctx: any) => {
    const user: UserWithRelations = ctx.dbUser;
    const cap = ctx.match?.trim();
    if (!cap) {
      return ctx.reply('⚠️ *Usage:* `/setcap 0.05` (Sets max ETH budget cap per transaction)', { parse_mode: 'Markdown' });
    }

    try {
      await pool.query(
        `UPDATE user_settings SET max_eth_cap = $2 WHERE user_id = $1`,
        [user.id, cap]
      );
      await ctx.reply(`✅ *Max ETH Safety Cap set to:* \`${cap} ETH\``, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
    } catch (err: any) {
      await ctx.reply(`❌ *Error:* \`${err.message}\``, { parse_mode: 'Markdown' });
    }
  });

  // /scan <chain> <contractAddress>
  bot.command('scan', async (ctx: any) => {
    const input = ctx.match?.trim() || '';
    const parts = input.split(' ');

    if (parts.length < 2) {
      return ctx.reply('⚠️ *Usage:* `/scan <chain> <contractAddress>`\n*Example:* `/scan base 0x123...abc`', { parse_mode: 'Markdown' });
    }

    const [chainName, contractAddress] = parts;
    await ctx.reply(`🔍 *Running Deep Security Audit on [${chainName.toUpperCase()}]...`);

    const audit = await runSecurityAudit(chainName, contractAddress);
    let report = `🛡️ *Security Audit Report*\n\n`;
    report += `🔹 *Target:* \`${contractAddress}\`\n`;
    report += `🔹 *Has Bytecode:* ${audit.hasBytecode ? '✅ Yes' : '❌ No'}\n`;
    report += `🔹 *Risk Level:* *${audit.riskLevel}*\n`;
    if (audit.isHoneypot) report += `🚨 *HONEYPOT DETECTED!*\n`;
    if (audit.isProxy) report += `ℹ️ Proxy contract detected.\n`;
    if (audit.ownerMintOnly) report += `⚠️ Owner-only mint detected.\n`;
    report += `🔹 *Bytecode Size:* ${audit.bytecodeSize} bytes\n`;
    if (audit.detectedFunctions.length > 0) {
      report += `🔹 *Detected Functions:* ${audit.detectedFunctions.join(', ')}\n`;
    }
    if (audit.error) {
      report += `⚠️ *Error:* ${audit.error}`;
    }

    await ctx.reply(report, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
  });

  // /snipe <chain> <contractAddress> [valueEth]
  bot.command('snipe', async (ctx: any) => {
    const user: UserWithRelations = ctx.dbUser;
    const input = ctx.match?.trim() || '';
    const args = input.split(' ');

    if (args.length < 2) {
      return ctx.reply('⚠️ *Usage:* `/snipe <chain> <contractAddress> [valueEth]`\n*Example:* `/snipe base 0x123...abc 0.01`', { parse_mode: 'Markdown' });
    }

    const [chainName, contractAddress, valueStr = '0'] = args;

    const wallet = await queryOne<any>(
      `SELECT * FROM wallets WHERE user_id = $1 AND is_default = true AND is_active = true LIMIT 1`,
      [user.id]
    );

    if (!wallet) {
      return ctx.reply('❌ No active default wallet configured. Generate or activate a wallet first.', { parse_mode: 'Markdown' });
    }

    await ctx.reply(`🚀 *Executing WL / Manual Mint on [${chainName.toUpperCase()}]*...`, { parse_mode: 'Markdown' });

    const valueWei = parseWeiValue(valueStr);

    const result = await dispatchMintTransaction({
      encryptedPrivateKey: wallet.encrypted_key,
      chainName,
      contractAddress: contractAddress as Address,
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

  // /addwhale <chain> <address> [label]
  bot.command('addwhale', async (ctx: any) => {
    const user: UserWithRelations = ctx.dbUser;
    const input = ctx.match?.trim() || '';
    const parts = input.split(' ');

    if (parts.length < 2) {
      return ctx.reply('⚠️ *Usage:* `/addwhale <chain> <address> [label]`', { parse_mode: 'Markdown' });
    }

    const [chainName, address, ...labelParts] = parts;
    const label = labelParts.join(' ') || 'Whale Target';

    try {
      await pool.query(
        `INSERT INTO whale_targets (user_id, chain_name, address, label) VALUES ($1, $2, $3, $4)`,
        [user.id, chainName.toLowerCase(), address, label]
      );
      await ctx.reply(`✅ *Whale Target Added!*\nTarget: \`${address}\` on [${chainName.toUpperCase()}]`, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
    } catch (err: any) {
      await ctx.reply(`❌ *Error:* \`${err.message}\``, { parse_mode: 'Markdown' });
    }
  });

  // /removewhale <address>
  bot.command('removewhale', async (ctx: any) => {
    const user: UserWithRelations = ctx.dbUser;
    const address = ctx.match?.trim();

    if (!address) {
      return ctx.reply('⚠️ *Usage:* `/removewhale <address>`', { parse_mode: 'Markdown' });
    }

    try {
      await pool.query(
        `DELETE FROM whale_targets WHERE user_id = $1 AND address ILIKE $2`,
        [user.id, address]
      );
      await ctx.reply(`✅ *Whale target removed:* \`${address}\``, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
    } catch (err: any) {
      await ctx.reply(`❌ *Error:* \`${err.message}\``, { parse_mode: 'Markdown' });
    }
  });

  // /schedule <chain> <contractAddress> <functionName> <valueEth> <timestampISO | blockNumber>
  bot.command('schedule', async (ctx: any) => {
    const user: UserWithRelations = ctx.dbUser;
    const input = ctx.match?.trim() || '';
    const args = input.split(' ');

    if (args.length < 5) {
      return ctx.reply(
        '⚠️ *Usage:* `/schedule <chain> <contractAddress> <functionName> <valueEth> <timestampISO | blockNumber>`\n' +
        '*Example timestamp:* `/schedule base 0x123...abc mint 0 2026-12-31T23:59:00Z`\n' +
        '*Example block:* `/schedule base 0x123...abc mint 0 19000000`',
        { parse_mode: 'Markdown' }
      );
    }

    const [chainName, contractAddress, functionName, valueStr, target] = args;

    try {
      let executeAt: string | null = null;
      let targetBlock: number | null = null;

      if (/^\d+$/.test(target) && target.length > 6) {
        targetBlock = parseInt(target, 10);
      } else {
        executeAt = new Date(target).toISOString();
      }

      const valueWei = parseWeiValue(valueStr).toString();

      const schedule = await createSchedule({
        userId: user.id,
        chainName: chainName.toLowerCase(),
        contractAddress,
        functionName,
        valueWei,
        executeAt,
        targetBlock,
      });

      await ctx.reply(
        `⏰ *Mint Scheduled Successfully!*\n\n` +
        `🔹 *Chain:* ${chainName.toUpperCase()}\n` +
        `🔹 *Contract:* \`${contractAddress}\`\n` +
        `🔹 *Function:* ${functionName}\n` +
        `🔹 *Value:* ${valueStr} ETH\n` +
        `🔹 *Execute ${targetBlock ? `at Block #${targetBlock}` : `at ${executeAt}`}*\n` +
        `🔹 *ID:* \`${schedule.id}\``,
        { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard }
      );
    } catch (err: any) {
      await ctx.reply(`❌ *Error:* \`${err.message}\``, { parse_mode: 'Markdown' });
    }
  });

  // /cancelschedule <scheduleId>
  bot.command('cancelschedule', async (ctx: any) => {
    const scheduleId = ctx.match?.trim();
    if (!scheduleId) {
      return ctx.reply('⚠️ *Usage:* `/cancelschedule <scheduleId>`', { parse_mode: 'Markdown' });
    }

    try {
      await cancelSchedule(scheduleId);
      await ctx.reply(`✅ *Schedule cancelled:* \`${scheduleId}\``, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
    } catch (err: any) {
      await ctx.reply(`❌ *Error:* \`${err.message}\``, { parse_mode: 'Markdown' });
    }
  });

  // /schedules - list all schedules
  bot.command('schedules', async (ctx: any) => {
    const user: UserWithRelations = ctx.dbUser;
    try {
      const schedules = await getSchedulesByUser(user.id);
      if (schedules.length === 0) {
        return ctx.reply('⏰ *No scheduled mints found.*\n\nUse `/schedule` to stage a delayed mint.', { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
      }

      let msg = '⏰ *Scheduled Mints:*\n\n';
      schedules.forEach((s, i) => {
        const statusIcon = s.status === 'pending' ? '⏳' : s.status === 'completed' ? '✅' : s.status === 'failed' ? '❌' : '🔄';
        msg += `${i + 1}. ${statusIcon} *${s.chain_name.toUpperCase()}* - \`${s.contract_address.slice(0, 10)}...\`\n`;
        msg += `   Function: ${s.function_name} | Value: ${s.value_wei} wei\n`;
        if (s.execute_at) msg += `   Execute at: ${s.execute_at}\n`;
        if (s.target_block) msg += `   Block: #${s.target_block}\n`;
        if (s.tx_hash) msg += `   Tx: \`${s.tx_hash.slice(0, 20)}...\`\n`;
        msg += `   ID: \`${s.id}\`\n\n`;
      });

      await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
    } catch (err: any) {
      await ctx.reply(`❌ *Error:* \`${err.message}\``, { parse_mode: 'Markdown' });
    }
  });

  // /watchlist <chain> <contractAddress> [label]
  bot.command('watchlist', async (ctx: any) => {
    const user: UserWithRelations = ctx.dbUser;
    const input = ctx.match?.trim() || '';
    const parts = input.split(' ');

    if (parts.length < 2) {
      return ctx.reply('⚠️ *Usage:* `/watchlist <chain> <contractAddress> [label]`', { parse_mode: 'Markdown' });
    }

    const [chainName, contractAddress, ...labelParts] = parts;
    const label = labelParts.join(' ') || 'Watchlist Target';

    try {
      await pool.query(
        `INSERT INTO watchlist_targets (user_id, chain_name, contract_address, label) VALUES ($1, $2, $3, $4)`,
        [user.id, chainName.toLowerCase(), contractAddress, label]
      );
      await ctx.reply(`✅ *Added to Watchlist!*\n\`${contractAddress}\` on [${chainName.toUpperCase()}]`, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
    } catch (err: any) {
      await ctx.reply(`❌ *Error:* \`${err.message}\``, { parse_mode: 'Markdown' });
    }
  });

  // /portfolio - live balance check
  bot.command('portfolio', async (ctx: any) => {
    const user: UserWithRelations = ctx.dbUser;
    try {
      const { fetchWalletBalances, formatPortfolioMessage } = await import('../core/portfolio');
      const chains = user.chain_toggles || [];
      const balances = await fetchWalletBalances(user.id, chains);
      const msg = formatPortfolioMessage(balances);
      await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
    } catch (err: any) {
      await ctx.reply(`❌ *Error:* \`${err.message}\``, { parse_mode: 'Markdown' });
    }
  });
}
