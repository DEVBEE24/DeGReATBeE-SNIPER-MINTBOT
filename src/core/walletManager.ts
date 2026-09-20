import { createWalletClient, http, Chain } from 'viem';
import { privateKeyToAccount, nonceManager } from 'viem/accounts';
import { decryptPrivateKey } from './crypto';
import { robinhoodChain, inkChain, arcChain } from '../config/chains';
import { mainnet, base } from 'viem/chains';

export function getChainConfig(chainName: string): Chain {
  switch (chainName.toLowerCase()) {
    case 'base':
      return base;
    case 'eth':
    case 'ethereum':
      return mainnet;
    case 'robinhood':
      return robinhoodChain;
    case 'ink':
      return inkChain;
    case 'arc':
      return arcChain;
    default:
      throw new Error(`Unsupported chain configuration: ${chainName}`);
  }
}

export function createUserWalletClient(encryptedPrivateKey: string, chainName: string, customRpcUrl?: string) {
  const rawPrivateKey = decryptPrivateKey(encryptedPrivateKey) as `0x${string}`;

  // Use viem nonceManager for smooth concurrent sequence handling
  const account = privateKeyToAccount(rawPrivateKey, {
    nonceManager,
  });

  const chain = getChainConfig(chainName);
  const rpcUrl = customRpcUrl || chain.rpcUrls.default.http[0];

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl, {
      timeout: 10_000,
      retryCount: 3,
      retryDelay: 500,
    }),
  });

  return {
    walletClient,
    account,
    address: account.address,
  };
}
