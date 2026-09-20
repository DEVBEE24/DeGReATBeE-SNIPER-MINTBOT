import { Address, parseUnits } from 'viem';
import { createUserWalletClient, getChainConfig } from './walletManager';
import { runPreFlightCheck } from './scanner';

export interface MintExecutionParams {
  encryptedPrivateKey: string;
  chainName: string;
  contractAddress: Address;
  abi: any;
  functionName: string;
  args?: any[];
  valueWei?: bigint;
  maxPriorityFeeGwei?: string;
  maxFeePerGasGwei?: string;
  customRpcUrl?: string;
}

export interface ExecutionResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export async function dispatchMintTransaction(params: MintExecutionParams): Promise<ExecutionResult> {
  const {
    encryptedPrivateKey,
    chainName,
    contractAddress,
    abi,
    functionName,
    args = [],
    valueWei = 0n,
    maxPriorityFeeGwei = '3.0',
    maxFeePerGasGwei = '30.0',
    customRpcUrl,
  } = params;

  try {
    const { walletClient, account } = createUserWalletClient(
      encryptedPrivateKey,
      chainName,
      customRpcUrl
    );

    const chain = getChainConfig(chainName);
    const transportUrl = customRpcUrl || chain.rpcUrls.default.http[0];

    // Pre-flight check before simulating
    const preFlight = await runPreFlightCheck(chainName, contractAddress, transportUrl, valueWei);
    if (!preFlight.isValid) {
      return {
        success: false,
        error: `Pre-flight validation failed: ${preFlight.error}`,
      };
    }

    const { createPublicClient, http } = await import('viem');
    const publicClient = createPublicClient({
      chain,
      transport: http(transportUrl, { timeout: 5000 }),
    });

    // Simulate transaction to prevent wasted gas
    try {
      await publicClient.simulateContract({
        account,
        address: contractAddress,
        abi,
        functionName,
        args,
        value: valueWei,
      });
    } catch (simError: any) {
      return {
        success: false,
        error: `Simulation reverted: ${simError.shortMessage || simError.message}`,
      };
    }

    const maxPriorityFeePerGas = parseUnits(maxPriorityFeeGwei, 9);
    const maxFeePerGas = parseUnits(maxFeePerGasGwei, 9);

    const txHash = await walletClient.writeContract({
      address: contractAddress,
      abi,
      functionName,
      args,
      value: valueWei,
      maxPriorityFeePerGas,
      maxFeePerGas,
      chain,
      account,
    });

    return {
      success: true,
      txHash,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Execution dispatch error: ${err.shortMessage || err.message || err}`,
    };
  }
}
