import { defineChain, Chain } from 'viem';
import { base, mainnet } from 'viem/chains';

// Custom chain definition for Robinhood Chain
export const robinhoodChain = defineChain({
  id: 46630,
  name: 'Robinhood Chain',
  network: 'robinhood',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.ROBINHOOD_RPC || 'https://rpc.robinhood.chain'] },
  },
});

// Custom chain definition for Ink Network
export const inkChain = defineChain({
  id: 57073,
  name: 'Ink',
  network: 'ink',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.INK_RPC || 'https://rpc.inkonchain.com'] },
  },
});

// Custom chain definition for Arc Network
export const arcChain = defineChain({
  id: 5042,
  name: 'Arc',
  network: 'arc',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.ARC_RPC || 'https://rpc.arcscan.io'] },
  },
});

/**
 * Returns the appropriate viem Chain object based on user string input.
 */
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

// List of all supported networks for our Checkmark Chains Hub
export const SUPPORTED_NETWORKS = [
  { chainName: 'base', name: 'Base' },
  { chainName: 'ethereum', name: 'Ethereum' },
  { chainName: 'robinhood', name: 'Robinhood Chain' },
  { chainName: 'ink', name: 'Ink' },
  { chainName: 'arc', name: 'Arc' },
];
