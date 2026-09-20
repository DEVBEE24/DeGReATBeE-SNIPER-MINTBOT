import { defineChain, http, fallback } from 'viem';

// Define custom/emerging chains not natively bundled in standard viem exports yet
export const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.ROBINHOOD_RPC_URL || 'https://rpc.robinhoodchain.com'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' },
  },
});

export const inkChain = defineChain({
  id: 57073,
  name: 'Ink Mainnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.INK_RPC_URL || 'https://rpc-qnd.inkonchain.com'] },
  },
  blockExplorers: {
    default: { name: 'Ink Explorer', url: 'https://explorer.inkonchain.com' },
  },
});

export const arcChain = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 }, // Arc uses USDC for gas!
  rpcUrls: {
    default: { http: [process.env.ARC_RPC_URL || 'https://rpc.mainnet.arc.io'] },
  },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' },
  },
});

// Helper to create rate-limited, resilient transports preventing 429 storms
export function createResilientTransport(rpcUrl: string) {
  return fallback([
    http(rpcUrl, {
      timeout: 10_000,
      retryCount: 3,
      retryDelay: 1000,
    }),
  ]);
}
