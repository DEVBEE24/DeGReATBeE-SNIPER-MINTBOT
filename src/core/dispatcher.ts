import { createWalletClient, http, parseEther, Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getChainConfig } from '../config/chains';
import { runPreFlightCheck } from './scanner';
import { decryptPrivateKey } from './crypto';

export interface DispatchParams {
  encryptedPrivateKey: string;
  chainName: string;
  contractAddress: Address;
  abi: any[];
  functionName: string;
  args: any[];
  valueWei: bigint;
  maxPriorityFeeGwei?: string;
  maxFeePerGasGwei?: string;
  maxEthCap?: string; // Safety budget cap in ETH
}

/**
 * Dispatches an EVM mint or sniper transaction securely with gas safety controls.
 */
export async function dispatchMintTransaction(params: DispatchParams) {
  try {
    const chain = getChainConfig(params.chainName);
    const rpcUrl = chain.rpcUrls.default.http[0];

    // 1. Pre-flight security audit verification
    const preFlight = await runPreFlightCheck(params.chainName, params.contractAddress, rpcUrl, params.valueWei);
    if (!preFlight.isValid) {
      return { success: false, error: `Pre-flight failed: ${preFlight.error}` };
    }

    // 2. Enforce Max ETH Safety Cap
    if (params.maxEthCap) {
      const maxCapWei = parseEther(params.maxEthCap);
      if (params.valueWei > maxCapWei) {
        return { 
          success: false, 
          error: `Aborted: Value (${params.valueWei} wei) exceeds Max ETH Safety Cap (${params.maxEthCap} ETH).` 
        };
      }
    }

    // 3. Decrypt wallet and initialize viem wallet client
    const rawPrivateKey = decryptPrivateKey(params.encryptedPrivateKey) as `0x${string}`;
    const account = privateKeyToAccount(rawPrivateKey);

    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    });

    // 4. Execute contract write transaction
    const hash = await walletClient.writeContract({
      address: params.contractAddress,
      abi: params.abi,
      functionName: params.functionName,
      args: params.args,
      value: params.valueWei,
    });

    return { success: true, txHash: hash };
  } catch (err: any) {
    return { success: false, error: err.message || 'Transaction execution reverted.' };
  }
}
