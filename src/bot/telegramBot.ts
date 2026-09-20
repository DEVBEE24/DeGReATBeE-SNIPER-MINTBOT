import { Bot } from 'grammy';
import { PrismaClient } from '@prisma/client';
import { encryptPrivateKey } from '../core/crypto';
import { dispatchMintTransaction } from '../core/dispatcher';
import { privateKeyToAccount } from 'viem/accounts';

const prisma = new PrismaClient();
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN || '');

// Multi-user database isolation middleware
bot.use(async (ctx, next) => {
  if (!ctx.from) return;
  const telegramId = ctx.from.id.toString();

  let user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        telegramId,
        username: ctx.from.username || ctx.from.first_name,
        settings: { create: {} },
      },
    });
  }
  (ctx as any).dbUser = user;
  await next();
});

bot.command('start', async (ctx) => {
  await ctx.reply(
    `🔥 *Mint-Executor-Engine Active*\n\n` +
    `Welcome to your professional multi-chain EVM sniping control panel.\n\n` +
    `*Commands:*\n` +
    `🔹 \`/addwallet <private_key> <label>\` - Securely store an encrypted wallet\n` +
    `🔹 \`/wallets\` - View your configured trading wallets\n` +
    `🔹 \`/snipe <chain> <contractAddress> <valueWei>\` - Execute instant free/paid mint\n\n` +
    `*Supported Chains:* Base, Robinhood, Arc, ETH, Ink`,
    { parse_mode: 'Markdown' }
  );
});

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
      { parse_mode: 'Markdown' }
    );
  } catch (err: any) {
    await ctx.reply(`❌ *Failed to store wallet:* \`${err.message}\``, { parse_mode: 'Markdown' });
  }
});

bot.command('wallets', async (ctx) => {
  const user = (ctx as any).dbUser;
  const wallets = await prisma.wallet.findMany({ where: { userId: user.id } });

  if (wallets.length === 0) {
    return ctx.reply('⚠️ You have no wallets configured. Use `/addwallet <key> <label>` to add one.', { parse_mode: 'Markdown' });
  }

  let response = '👛 *Your Configured Wallets:*\n\n';
  wallets.forEach((w, index) => {
    response += `${index + 1}. *${w.label}*${w.isDefault ? '(Default)' : ''}\n   \`${w.address}\`\n\n`;
  });

  await ctx.reply(response, { parse_mode: 'Markdown' });
});

bot.command('snipe', async (ctx) => {
  const user = (ctx as any).dbUser;
  const input = ctx.match?.trim() || '';
  const args = input.split(' ');

  if (args.length < 2) {
    return ctx.reply(
      '⚠️ *Usage:* `/snipe <chain> <contractAddress> [valueWei]`\n' +
      '*Example (Free Mint):* `/snipe base 0x123...abc 0`',
      { parse_mode: 'Markdown' }
    );
  }

  const [chainName, contractAddress, valueWeiStr = '0'] = args;

  const wallet = await prisma.wallet.findFirst({
    where: { userId: user.id, isDefault: true },
  });

  if (!wallet) {
    return ctx.reply('❌ No default wallet found. Add a wallet first using `/addwallet`.', { parse_mode: 'Markdown' });
  }

  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });

  await ctx.reply(`🚀 *Running Pre-Flight & Dispatch on [${chainName.toUpperCase()}]*\nTarget: \`${contractAddress}\``, { parse_mode: 'Markdown' });

  const standardMintAbi = [
    { inputs: [], name: 'mint', outputs: [], stateMutability: 'payable', type: 'function' },
  ];

  const result = await dispatchMintTransaction({
    encryptedPrivateKey: wallet.encryptedKey,
    chainName,
    contractAddress: contractAddress as any,
    abi: standardMintAbi,
    functionName: 'mint',
    args: [],
    valueWei: BigInt(valueWeiStr),
    maxPriorityFeeGwei: settings?.priorityGwei || '3.0',
    maxFeePerGasGwei: '30.0',
  });

  if (result.success) {
    await ctx.reply(`✅ *Mint Executed Successfully!*\n\n🔗 *Tx Hash:* \`${result.txHash}\``, { parse_mode: 'Markdown' });
  } else {
    await ctx.reply(`❌ *Execution Reverted / Failed:*\n\`${result.error}\``, { parse_mode: 'Markdown' });
  }
});

export function startTelegramBot() {
  bot.start();
  console.log('[TelegramBot] 🤖 Multi-User Control Panel Bot is online.');
}
