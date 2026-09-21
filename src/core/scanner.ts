import { createPublicClient, http, Address, getAddress } from 'viem';
import { getChainConfig } from './walletManager';

export interface AuditResult {
  isValid: boolean;
  isVerified: boolean;
  hasBytecode: boolean;
  detectedFunctions: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  error?: string;
}

export async function runSecurityAudit(chainName: string, contractAddress: string): Promise<AuditResult> {
  try {
    const formattedAddress = getAddress(contractAddress);
    const chain = getChainConfig(chainName);
    const client = createPublicClient({ chain, transport: http() });

    // 1. Fetch Bytecode
    const bytecode = await client.getBytecode({ address: formattedAddress });
    
    if (!bytecode || bytecode === '0x') {
      return {
        isValid: false,
        isVerified: false,
        hasBytecode: false,
        detectedFunctions: [],
        riskLevel: 'CRITICAL',
        error: 'Contract does not exist or has no bytecode deployed on this chain.',
      };
    }

    const detectedFunctions: string[] = [];
    if (bytecode.includes('1249c58b') || bytecode.toLowerCase().includes('mint')) detectedFunctions.push('mint() / Public Mint');
    if (bytecode.includes('6a627842') || bytecode.toLowerCase().includes('safemint')) detectedFunctions.push('safeMint()');
    if (bytecode.includes('4031718f') || bytecode.toLowerCase().includes('claim')) detectedFunctions.push('claim() / WL Claim');

    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    if (detectedFunctions.length === 0) {
      riskLevel = 'MEDIUM';
    }

    return {
      isValid: true,
      isVerified: detectedFunctions.length > 0,
      hasBytecode: true,
      detectedFunctions,
      riskLevel,
    };
  } catch (err: any) {
    return {
      isValid: false,
      isVerified: false,
      hasBytecode: false,
      detectedFunctions: [],
      riskLevel: 'CRITICAL',
      error: err.message || 'Failed to connect or parse contract bytecode.',
    };
  }
}

// Compatibility wrapper for dispatcher.ts & pre-flight verification
export async function runPreFlightCheck(
  chainName: string,
  contractAddress: Address,
  rpcUrl: string,
  valueWei: bigint
): Promise<{ isValid: boolean; error?: string }> {
  const audit = await runSecurityAudit(chainName, contractAddress);
  return {
    isValid: audit.isValid,
    error: audit.error
  };
}
