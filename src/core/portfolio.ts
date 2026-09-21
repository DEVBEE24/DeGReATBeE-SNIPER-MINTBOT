import { createPublicClient, http, Address, formatEther } from 'viem';
import { getChainConfig } from '../config/chains';
import { supabase } from '../config/supabase';
import { Wallet } from '../types/database';

export interface WalletBalance {
  walletId: string;
  address: string;
  label: string;
  chainName: string;
  chainDisplayName: string;
  balanceEth: string;
  isActive: boolean;
  isDefault: boolean;
}

export async function fetchWalletBalances(userId: string, chains: { chain_name: string; enabled: boolean }[]) {
  const { data: wallets, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  if (!wallets || wallets.length === 0) return [];

  const activeChains = chains.filter((c) => c.enabled);
  const results: WalletBalance[] = [];

  await Promise.all(
    (wallets as Wallet[]).flatMap((wallet) =>
      activeChains.map(async (chain) => {
        try {
          const chainConfig = getChainConfig(chain.chain_name);
          const client = createPublicClient({
            chain: chainConfig,
            transport: http(chainConfig.rpcUrls.default.http[0], { timeout: 8_000 }),
          });
          const balance = await client.getBalance({ address: wallet.address as Address });
          results.push({
            walletId: wallet.id,
            address: wallet.address,
            label: wallet.label,
            chainName: chain.chain_name,
            chainDisplayName: chainConfig.name,
            balanceEth: formatEther(balance),
            isActive: wallet.is_active,
            isDefault: wallet.is_default,
          });
        } catch {
          results.push({
            walletId: wallet.id,
            address: wallet.address,
            label: wallet.label,
            chainName: chain.chain_name,
            chainDisplayName: getChainConfig(chain.chain_name).name,
            balanceEth: '0.0',
            isActive: wallet.is_active,
            isDefault: wallet.is_default,
          });
        }
      })
    )
  );

  return results;
}

export function formatPortfolioMessage(balances: WalletBalance[]): string {
  if (balances.length === 0) {
    return '🖼️ *Portfolio View*\n\nNo wallets or active chains found.';
  }

  const byWallet = new Map<string, WalletBalance[]>();
  for (const b of balances) {
    const list = byWallet.get(b.walletId) || [];
    list.push(b);
    byWallet.set(b.walletId, list);
  }

  let msg = '🖼️ *Live Portfolio View*\n\n';
  let totalEth = 0;

  for (const [walletId, chainBalances] of byWallet) {
    const w = chainBalances[0];
    const statusIcon = w.isActive ? '🟢' : '🔴';
    const defaultIcon = w.isDefault ? '⭐' : '';
    msg += `${statusIcon}${defaultIcon} *${w.label}*\n`;
    msg += `   \`${w.address}\`\n`;
    for (const cb of chainBalances) {
      const bal = parseFloat(cb.balanceEth);
      totalEth += bal;
      msg += `   • ${cb.chainDisplayName}: \`${cb.balanceEth} ETH\`\n`;
    }
    msg += '\n';
  }

  msg += `💰 *Total Portfolio Value:* \`${totalEth.toFixed(6)} ETH\``;
  return msg;
}
