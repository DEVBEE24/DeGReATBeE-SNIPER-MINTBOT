import { createPublicClient, http, Address, getAddress } from 'viem';
import { getChainConfig } from '../config/chains';

export interface AuditResult {
  isValid: boolean;
  isVerified: boolean;
  hasBytecode: boolean;
  detectedFunctions: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  isHoneypot: boolean;
  isProxy: boolean;
  bytecodeSize: number;
  ownerMintOnly: boolean;
  error?: string;
}

const HONEYPOT_SIGNATURES = [
  'a9059cbb', // transfer(address,uint256)
  '095ea7b3', // approve(address,uint256)
  '70a08231', // balanceOf(address)
  'dd62ed3e', // allowance(address,address)
];

const SUSPICIOUS_OPCODES: Record<string, string> = {
  'f4': 'DELEGATECALL',
  'f5': 'CREATE',
};

const PROXY_SIGNATURES = [
  '3f4ba83a', // proxiableUUID
  '5c60da1b', // implementation()
  '360894a4', // admin()
];

export async function runSecurityAudit(chainName: string, contractAddress: string): Promise<AuditResult> {
  const empty: AuditResult = {
    isValid: false,
    isVerified: false,
    hasBytecode: false,
    detectedFunctions: [],
    riskLevel: 'CRITICAL',
    isHoneypot: false,
    isProxy: false,
    bytecodeSize: 0,
    ownerMintOnly: false,
  error: 'Unknown error',
  };

  try {
    const formattedAddress = getAddress(contractAddress);
    const chain = getChainConfig(chainName);
    const client = createPublicClient({ chain, transport: http() });

    const bytecode = await client.getBytecode({ address: formattedAddress });

    if (!bytecode || bytecode === '0x') {
      return { ...empty, error: 'Contract does not exist or has no bytecode deployed on this chain.' };
    }

    const bytecodeLower = bytecode.toLowerCase();
    const bytecodeSize = (bytecode.length - 2) / 2;

    const detectedFunctions: string[] = [];
    if (bytecodeLower.includes('1249c58b') || bytecodeLower.includes('mint')) detectedFunctions.push('mint()');
    if (bytecodeLower.includes('6a627842') || bytecodeLower.includes('safemint')) detectedFunctions.push('safeMint()');
    if (bytecodeLower.includes('4031718f') || bytecodeLower.includes('claim')) detectedFunctions.push('claim()');
    if (bytecodeLower.includes('a9059cbb')) detectedFunctions.push('transfer()');
    if (bytecodeLower.includes('4e71d92d') || bytecodeLower.includes('claimable')) detectedFunctions.push('claimable()');

    const isProxy = PROXY_SIGNATURES.some((sig) => bytecodeLower.includes(sig));

    const hasOwnerMint = bytecodeLower.includes('owner()') && detectedFunctions.includes('mint()');
    const ownerMintOnly = hasOwnerMint && !bytecodeLower.includes('1249c58b');

    let honeypotScore = 0;
    for (const sig of HONEYPOT_SIGNATURES) {
      if (bytecodeLower.includes(sig)) honeypotScore++;
    }
    if (bytecodeLower.includes('f4')) honeypotScore += 2;
    if (bytecodeSize < 200 && honeypotScore >= 3) honeypotScore += 2;
    const isHoneypot = honeypotScore >= 4 && !detectedFunctions.some((f) => f.includes('mint') || f.includes('claim'));

    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    if (isHoneypot) riskLevel = 'CRITICAL';
    else if (isProxy) riskLevel = 'MEDIUM';
    else if (ownerMintOnly) riskLevel = 'HIGH';
    else if (detectedFunctions.length === 0) riskLevel = 'MEDIUM';
    else if (bytecodeSize < 500) riskLevel = 'MEDIUM';

    return {
      isValid: true,
      isVerified: detectedFunctions.length > 0,
      hasBytecode: true,
      detectedFunctions,
      riskLevel,
      isHoneypot,
      isProxy,
      bytecodeSize,
      ownerMintOnly,
    };
  } catch (err: any) {
    return { ...empty, error: err.message || 'Failed to connect or parse contract bytecode.' };
  }
}

export async function runPreFlightCheck(
  chainName: string,
  contractAddress: Address,
  rpcUrl: string,
  valueWei: bigint
): Promise<{ isValid: boolean; error?: string }> {
  const audit = await runSecurityAudit(chainName, contractAddress);
  if (!audit.isValid) {
    return { isValid: false, error: audit.error };
  }
  if (audit.isHoneypot) {
    return { isValid: false, error: 'Contract flagged as potential honeypot. Transaction aborted for safety.' };
  }
  if (audit.riskLevel === 'CRITICAL') {
    return { isValid: false, error: 'Contract has CRITICAL risk level. Transaction aborted for safety.' };
  }
  return { isValid: true };
}
