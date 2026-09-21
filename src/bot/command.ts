import { PrismaClient } from '@prisma/client';
import { encryptPrivateKey } from '../core/crypto';
import { dispatchMintTransaction } from '../core/dispatcher';
import { runSecurityAudit } from '../core/scanner';
import { privateKeyToAccount } from 'viem/accounts';
import { Address } from 'viem';
import { backToMenuKeyboard, getMainDashboardKeyboard } from './keyboards';

const prisma = new PrismaClient();

export function registerCommands(bot: any) {
  // /start command
  bot.command('start', async (ctx: any) => {
    const user = ctx.dbUser;
    const welcomeText = 
      `🤖 *ApexBee Professional Sniper Engine*\n\n` +
      `Welcome back, *${user.username || 'Trader'}*!\n` +
      `Your high-speed multi-chain EVM mint & security auditing terminal is active.\n\n` +
      `Select an option below:`;

    await ctx.reply(welcomeText, {
      parse_mode: 'Markdown',
      reply_markup: getMainDashboardKeyboard(user.settings?.autoMintActive || false),
    });
  });

  // /addwallet <private_key> [label]
  bot.command('addwallet', async (ctx: any) => {
    const user = ctx.dbUser;
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
        data: {
          userId: user.id,
          address: account.address,
          encryptedKey,
          label,
          isDefault: existingCount === 0,
          isActive: true,
        },
      });

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
    const user = ctx.dbUser;
    const cap = ctx.match?.trim();
    if (!cap) {
      return ctx.reply('⚠️ *Usage:* `/setcap 0.05` (Sets max ETH budget cap per transaction)', { parse_mode: 'Markdown' });
    }

    await prisma.userSettings.update({
      where: { userId: user.id },
      data: { maxEthCap: cap },
    });

    await ctx.reply(`✅ *Max ETH Safety Cap set to:* \`${cap} ETH\``, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
  });

  // /scan <chain> <contractAddress>
  bot.command('scan', async (ctx: any) => {
    const input = ctx.match?.trim() || '';
    const parts = input.split(' ');

    if (parts.length < 2) {
      return ctx.reply('⚠️ *Usage:* `/scan <chain> <contractAddress>`\n*Example:* `/scan base 0x123...abc`', { parse_mode: 'Markdown' });
    }

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

  // /snipe <chain> <contractAddress> [valueWei]
  bot.command('snipe', async (ctx: any) => {
    const user = ctx.dbUser;
    const input = ctx.match?.trim() || '';
    const args = input.split(' ');

    if (args.length < 2) {
      return ctx.reply('⚠️ *Usage:* `/snipe <chain> <contractAddress> [valueWei]`', { parse_mode: 'Markdown' });
    }

    const [chainName, contractAddress, valueWeiStr = '0'] = args;
    const wallet = await prisma.wallet.findFirst({
      where: { userId: user.id, isDefault: true, isActive: true },
    });

    if (!wallet) {
      return ctx.reply('❌ No active default wallet configured. Generate or activate a wallet first.', { parse_mode: 'Markdown' });
    }

    await ctx.reply(`🚀 *Executing WL / Manual Mint on [${chainName.toUpperCase()}]*...`, { parse_mode: 'Markdown' });

    const result = await dispatchMintTransaction({
      encryptedPrivateKey: wallet.encryptedKey,
      chainName,
      contractAddress: contractAddress as Address,
      abi: [{ inputs: [], name: 'mint', outputs: [], stateMutability: 'payable', type: 'function' }],
      functionName: 'mint',
      args: [],
      valueWei: BigInt(valueWeiStr),
      maxPriorityFeeGwei: user.settings?.priorityGwei || '3.0',
      maxFeePerGasGwei: '30.0',
      maxEthCap: user.settings?.maxEthCap || '0.05',
    });

    if (result.success) {
      await ctx.reply(`✅ *Mint Executed Successfully!*\n\n🔗 *Tx Hash:* \`${result.txHash}\``, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
    } else {
      await ctx.reply(`❌ *Execution Failed:*\n\`${result.error}\``, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
    }
  });

  // /addwhale <chain> <address> [label]
  bot.command('addwhale', async (ctx: any) => {
    const user = ctx.dbUser;
    const input = ctx.match?.trim() || '';
    const parts = input.split(' ');

    if (parts.length < 2) {
      return ctx.reply('⚠️ *Usage:* `/addwhale <chain> <address> [label]`', { parse_mode: 'Markdown' });
    }

    const [chainName, address, ...labelParts] = parts;
    const label = labelParts.join(' ') || 'Whale Target';

    try {
      await prisma.whaleTarget.create({
        data: { userId: user.id, chainName: chainName.toLowerCase(), address, label },
      });
      await ctx.reply(`✅ *Whale Target Added!*\nTarget: \`${address}\` on [${chainName.toUpperCase()}]`, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
    } catch (err: any) {
      await ctx.reply(`❌ *Error:* \`${err.message}\``, { parse_mode: 'Markdown' });
    }
  });

  // /removewhale <address>
  bot.command('removewhale', async (ctx: any) => {
    const user = ctx.dbUser;
    const address = ctx.match?.trim();

    if (!address) {
      return ctx.reply('⚠️ *Usage:* `/removewhale <address>`', { parse_mode: 'Markdown' });
    }

    try {
      await prisma.whaleTarget.deleteMany({
        where: { userId: user.id, address: { equals: address, mode: 'insensitive' } },
      });
      await ctx.reply(`✅ *Whale target removed:* \`${address}\``, { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard });
    } catch (err: any) {
      await ctx.reply(`❌ *Error:* \`${err.message}\``, { parse_mode: 'Markdown' });
    }
  });
}
