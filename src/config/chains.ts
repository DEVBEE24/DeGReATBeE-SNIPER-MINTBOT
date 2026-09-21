import { defineChain, Chain } from 'viem';
import { base, mainnet } from 'viem/chains';

export const robinhoodChain = defineChain({
  id: 46630,
  name: 'Robinhood Chain',
  network: 'robinhood',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.ROBINHOOD_RPC_URL || 'https://rpc.robinhoodchain.com'] },
  },
});

export const inkChain = defineChain({
  id: 57073,
  name: 'Ink',
  network: 'ink',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.INK_RPC_URL || 'https://rpc-qnd.inkonchain.com'] },
  },
});

export const arcChain = defineChain({
  id: 5042,
  name: 'Arc',
  network: 'arc',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.ARC_RPC_URL || 'https://rpc.mainnet.arc.io'] },
  },
});

export function getChainConfig(chainName: string): Chain {
  switch (chainName.toLowerCase().trim()) {
    case 'base':
      return base;
    case 'ethereum':
    case 'eth':
      return mainnet;
    case 'robinhood':
      return robinhoodChain;
    case 'ink':
      return inkChain;
    case 'arc':
      return arcChain;
    default:
      return base;
  }
}

export const SUPPORTED_NETWORKS = [
  { chainName: 'base', name: 'Base' },
  { chainName: 'ethereum', name: 'Ethereum' },
  { chainName: 'robinhood', name: 'Robinhood Chain' },
  { chainName: 'ink', name: 'Ink' },
  { chainName: 'arc', name: 'Arc' },
] as const;

export const SUPPORTED_CHAIN_NAMES = SUPPORTED_NETWORKS.map((n) => n.chainName);

export function isValidChain(chainName: string): boolean {
  return SUPPORTED_CHAIN_NAMES.includes(chainName.toLowerCase().trim() as any);
}
