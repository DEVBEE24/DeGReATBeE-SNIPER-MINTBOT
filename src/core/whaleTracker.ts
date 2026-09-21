import { createPublicClient, http, Address } from 'viem';
import { getChainConfig } from '../config/chains';
import { dispatchMintTransaction, MintExecutionParams } from './dispatcher';
import { supabase } from '../config/supabase';
import { decryptPrivateKey } from './crypto';
import { privateKeyToAccount } from 'viem/accounts';

export interface WhaleListenerConfig {
  chainName: string;
  whaleAddresses: Address[];
  userId: string;
  encryptedPrivateKey: string;
  customRpcUrl?: string;
  maxPriorityFeeGwei?: string;
  maxFeePerGasGwei?: string;
  maxEthCap?: string;
}

interface ActiveTracker {
  chainName: string;
  stop: () => void;
}

const activeTrackers = new Map<string, ActiveTracker>();

export function startWhaleTracker(config: WhaleListenerConfig) {
  const {
    chainName,
    whaleAddresses,
    userId,
    encryptedPrivateKey,
    customRpcUrl,
    maxPriorityFeeGwei = '3.0',
    maxFeePerGasGwei = '30.0',
    maxEthCap = '0.05',
  } = config;

  const chain = getChainConfig(chainName);
  const transportUrl = customRpcUrl || chain.rpcUrls.default.http[0];

  const publicClient = createPublicClient({
    chain,
    transport: http(transportUrl, { timeout: 10_000 }),
  });

  const normalizedWhales = new Set(whaleAddresses.map((addr) => addr.toLowerCase()));

  console.log(`[WhaleTracker] 🚀 Listening on [${chainName}] for ${whaleAddresses.length} whales (User:${userId})`);

  const unwatch = publicClient.watchBlocks({
    includeTransactions: true,
    onBlock: async (block) => {
      try {
        if (!block.transactions || block.transactions.length === 0) return;

        const whaleTx = block.transactions.find(
          (tx) => typeof tx === 'object' && tx.from && normalizedWhales.has(tx.from.toLowerCase())
        );

        if (!whaleTx || typeof whaleTx !== 'object') return;

        const targetContract = whaleTx.to;
        if (!targetContract) return;

        console.log(`[WhaleTracker] 🎯 Whale hit! Whale ${whaleTx.from} -> Contract ${targetContract}`);

        const executionParams: MintExecutionParams = {
          encryptedPrivateKey,
          chainName,
          contractAddress: targetContract,
          abi: [{ inputs: [], name: 'mint', outputs: [], stateMutability: 'payable', type: 'function' }],
          functionName: 'mint',
          args: [],
          valueWei: whaleTx.value || 0n,
          maxPriorityFeeGwei,
          maxFeePerGasGwei,
          maxEthCap,
          customRpcUrl,
        };

        const result = await dispatchMintTransaction(executionParams);
        if (result.success) {
          console.log(`[WhaleTracker] ✅ Copied whale mint successfully! Tx: ${result.txHash}`);
        } else {
          console.error(`[WhaleTracker] ❌ Copy mint failed: ${result.error}`);
        }
      } catch (err: any) {
        console.error(`[WhaleTracker] Error processing block:`, err.message || err);
      }
    },
    onError: (error) => {
      console.error(`[WhaleTracker] Block stream error on ${chainName}:`, error.message || error);
    },
  });

  return {
    stop: () => {
      unwatch();
      console.log(`[WhaleTracker] Stopped listener for ${chainName}`);
    },
  };
}

export async function startAllWhaleTrackersForUser(userId: string) {
  const { data: chains } = await supabase
    .from('chain_toggles')
    .select('*')
    .eq('user_id', userId)
    .eq('enabled', true);

  const { data: whales } = await supabase
    .from('whale_targets')
    .select('*')
    .eq('user_id', userId);

  const { data: settings } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  const { data: wallet } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .eq('is_default', true)
    .eq('is_active', true)
    .maybeSingle();

  if (!chains || !whales || !wallet || !settings) return;

  const whaleByChain = new Map<string, Address[]>();
  for (const w of whales) {
    const list = whaleByChain.get(w.chain_name) || [];
    list.push(w.address as Address);
    whaleByChain.set(w.chain_name, list);
  }

  for (const chain of chains) {
    const chainWhales = whaleByChain.get(chain.chain_name);
    if (!chainWhales || chainWhales.length === 0) continue;

    const key = `${userId}_${chain.chain_name}`;
    const existing = activeTrackers.get(key);
    if (existing) existing.stop();

    const tracker = startWhaleTracker({
      chainName: chain.chain_name,
      whaleAddresses: chainWhales,
      userId,
      encryptedPrivateKey: wallet.encrypted_key,
      maxPriorityFeeGwei: settings.priority_gwei,
      maxFeePerGasGwei: '30.0',
      maxEthCap: settings.max_eth_cap,
    });

    activeTrackers.set(key, { chainName: chain.chain_name, stop: tracker.stop });
  }
}

export function stopAllWhaleTrackersForUser(userId: string) {
  for (const [key, tracker] of activeTrackers) {
    if (key.startsWith(`${userId}_`)) {
      tracker.stop();
      activeTrackers.delete(key);
    }
  }
}

export function stopAllWhaleTrackers() {
  for (const [, tracker] of activeTrackers) {
    tracker.stop();
  }
  activeTrackers.clear();
}
