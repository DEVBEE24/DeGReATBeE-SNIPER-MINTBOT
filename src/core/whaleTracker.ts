import { createPublicClient, http, Address } from 'viem';
import { getChainConfig } from '../config/chains';
import { dispatchMintTransaction, MintExecutionParams } from './dispatcher';

export interface WhaleListenerConfig {
  chainName: string;
  whaleAddresses: Address[];
  userId: string;
  encryptedPrivateKey: string;
  customRpcUrl?: string;
  maxPriorityFeeGwei?: string;
  maxFeePerGasGwei?: string;
}

export function startWhaleTracker(config: WhaleListenerConfig) {
  const {
    chainName,
    whaleAddresses,
    userId,
    encryptedPrivateKey,
    customRpcUrl,
    maxPriorityFeeGwei = '3.0',
    maxFeePerGasGwei = '30.0',
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

        for (const tx of block.transactions) {
          if (typeof tx === 'object' && tx.from && normalizedWhales.has(tx.from.toLowerCase())) {
            const targetContract = tx.to;
            if (!targetContract) continue;

            console.log(`[WhaleTracker] 🎯 Whale hit! Whale ${tx.from} -> Contract${targetContract}`);

            const executionParams: MintExecutionParams = {
              encryptedPrivateKey,
              chainName,
              contractAddress: targetContract,
              abi: [{ inputs: [], name: 'mint', outputs: [], stateMutability: 'payable', type: 'function' }],
              functionName: 'mint',
              args: [],
              valueWei: tx.value || 0n,
              maxPriorityFeeGwei,
              maxFeePerGasGwei,
              customRpcUrl,
            };

            const result = await dispatchMintTransaction(executionParams);
            if (result.success) {
              console.log(`[WhaleTracker] ✅ Copied whale mint successfully! Tx: ${result.txHash}`);
            } else {
              console.error(`[WhaleTracker] ❌ Copy mint failed: ${result.error}`);
            }
          }
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
