import { createPublicClient, http, Address, parseAbi } from 'viem';
import { getChainConfig } from './walletManager';

const MINIMAL_MINT_CHECK_ABI = parseAbi([
  'function cost() view returns (uint256)',
  'function PRICE() view returns (uint256)',
  'function price() view returns (uint256)',
  'function mintPrice() view returns (uint256)',
  'function paused() view returns (bool)'
]);

export interface PreFlightCheckResult {
  isValid: boolean;
  isContract: boolean;
  isZeroWei: boolean;
  mintPrice: bigint;
  error?: string;
}

export async function runPreFlightCheck(
  chainName: string,
  contractAddress: Address,
  rpcUrl?: string,
  maxAllowedPriceWei: bigint = 0n
): Promise<PreFlightCheckResult> {
  try {
    const chain = getChainConfig(chainName);
    const transportUrl = rpcUrl || chain.rpcUrls.default.http[0];

    const publicClient = createPublicClient({
      chain,
      transport: http(transportUrl, { timeout: 8000 }),
    });

    const bytecode = await publicClient.getBytecode({ address: contractAddress });
    if (!bytecode || bytecode === '0x') {
      return {
        isValid: false,
        isContract: false,
        isZeroWei: false,
        mintPrice: 0n,
        error: 'Target is an empty address or user wallet (EOA), not a smart contract.',
      };
    }

    let resolvedPrice = 0n;
    const priceFunctions = ['cost', 'PRICE', 'price', 'mintPrice'];
    
    for (const fnName of priceFunctions) {
      try {
        const priceResult = await publicClient.readContract({
          address: contractAddress,
          abi: MINIMAL_MINT_CHECK_ABI,
          functionName: fnName as any,
        });
        if (typeof priceResult === 'bigint') {
          resolvedPrice = priceResult;
          break;
        }
      } catch {
        // Function not present on this interface
      }
    }

    const isZeroWei = resolvedPrice === 0n;

    if (!isZeroWei && resolvedPrice > maxAllowedPriceWei) {
      return {
        isValid: false,
        isContract: true,
        isZeroWei: false,
        mintPrice: resolvedPrice,
        error: `Contract price (${resolvedPrice.toString()} wei) exceeds max allowed limit.`,
      };
    }

    return {
      isValid: true,
      isContract: true,
      isZeroWei,
      mintPrice: resolvedPrice,
    };
  } catch (err: any) {
    return {
      isValid: false,
      isContract: false,
      isZeroWei: false,
      mintPrice: 0n,
      error: `Pre-flight RPC failure: ${err.message || err}`,
    };
  }
}
