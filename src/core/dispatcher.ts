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
  maxEthCap?: string;
  customRpcUrl?: string;
}

export type MintExecutionParams = DispatchParams;

export interface DispatchResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export async function dispatchMintTransaction(params: DispatchParams): Promise<DispatchResult> {
  try {
    const chain = getChainConfig(params.chainName);
    const rpcUrl = params.customRpcUrl || chain.rpcUrls.default.http[0];

    const preFlight = await runPreFlightCheck(params.chainName, params.contractAddress, rpcUrl, params.valueWei);
    if (!preFlight.isValid) {
      return { success: false, error: `Pre-flight failed: ${preFlight.error}` };
    }

    if (params.maxEthCap) {
      const maxCapWei = parseEther(params.maxEthCap);
      if (params.valueWei > maxCapWei) {
        return {
          success: false,
          error: `Aborted: Value (${params.valueWei} wei) exceeds Max ETH Safety Cap (${params.maxEthCap} ETH).`,
        };
      }
    }

    const rawPrivateKey = decryptPrivateKey(params.encryptedPrivateKey) as `0x${string}`;
    const account = privateKeyToAccount(rawPrivateKey);

    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    });

    const hash = await walletClient.writeContract({
      address: params.contractAddress,
      abi: params.abi,
      functionName: params.functionName,
      args: params.args,
      value: params.valueWei,
      account,
    });

    return { success: true, txHash: hash };
  } catch (err: any) {
    return { success: false, error: err.message || 'Transaction execution reverted.' };
  }
}

export function parseWeiValue(valueStr: string): bigint {
  const trimmed = valueStr.trim();
  if (trimmed.startsWith('0x')) {
    return BigInt(trimmed);
  }
  if (/^\d+$/.test(trimmed)) {
    return BigInt(trimmed);
  }
  return parseEther(trimmed);
}
