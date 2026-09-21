import { Address, getAddress, isAddress } from 'viem';
import { getChainConfig, SUPPORTED_NETWORKS } from '../config/chains';
import { createPublicClient, http } from 'viem';
import { runSecurityAudit } from './scanner';
import { InlineKeyboard } from 'grammy';

const ADDRESS_REGEX = /\b0x[a-fA-F0-9]{40}\b/g;

export function extractContractAddress(text: string): string | null {
  const matches = text.match(ADDRESS_REGEX);
  if (!matches || matches.length === 0) return null;
  return matches[0];
}

export async function detectChainForAddress(address: string): Promise<string | null> {
  const formatted = getAddress(address);

  const results = await Promise.all(
    SUPPORTED_NETWORKS.map(async (net) => {
      try {
        const chain = getChainConfig(net.chainName);
        const client = createPublicClient({
          chain,
          transport: http(chain.rpcUrls.default.http[0], { timeout: 6_000 }),
        });
        const bytecode = await client.getBytecode({ address: formatted });
        return { chainName: net.chainName, hasBytecode: bytecode && bytecode !== '0x' };
      } catch {
        return { chainName: net.chainName, hasBytecode: false };
      }
    })
  );

  const found = results.find((r) => r.hasBytecode);
  return found ? found.chainName : null;
}

export async function interceptAddressMessage(text: string): Promise<{
  address: string;
  chainName: string;
  auditSummary: string;
  keyboard: InlineKeyboard;
} | null> {
  const address = extractContractAddress(text);
  if (!address) return null;

  const chainName = await detectChainForAddress(address);
  if (!chainName) {
    return {
      address,
      chainName: 'unknown',
      auditSummary: '⚠️ Contract not found on any active chain.',
      keyboard: new InlineKeyboard().text('🏠 Main Menu', 'menu_main'),
    };
  }

  const audit = await runSecurityAudit(chainName, address);

  let summary = `🔍 *Auto-Detected Contract*\n\n`;
  summary += `🔹 *Address:* \`${address}\`\n`;
  summary += `🔹 *Chain:* ${chainName.toUpperCase()}\n`;
  summary += `🔹 *Bytecode:* ${audit.hasBytecode ? '✅ Yes' : '❌ No'}\n`;
  summary += `🔹 *Risk Level:* *${audit.riskLevel}*\n`;
  if (audit.isHoneypot) summary += `🚨 *HONEYPOT DETECTED!*\n`;
  if (audit.isProxy) summary += `ℹ️ Proxy contract detected.\n`;
  if (audit.detectedFunctions.length > 0) {
    summary += `🔹 *Functions:* ${audit.detectedFunctions.join(', ')}\n`;
  }
  if (audit.error) {
    summary += `⚠️ *Error:* ${audit.error}\n`;
  }

  const keyboard = new InlineKeyboard()
    .text('🔍 Full Audit', `intercept_scan_${chainName}_${address}`)
    .text('👁️ Add to Watchlist', `intercept_watch_${chainName}_${address}`).row()
    .text('🚀 Quick Mint (0 ETH)', `intercept_mint_${chainName}_${address}_0`)
    .text('💰 Mint (0.01 ETH)', `intercept_mint_${chainName}_${address}_0.01`).row()
    .text('⏰ Schedule Mint', `intercept_schedule_${chainName}_${address}`).row()
    .text('🏠 Main Menu', 'menu_main');

  return { address, chainName, auditSummary: summary, keyboard };
}
