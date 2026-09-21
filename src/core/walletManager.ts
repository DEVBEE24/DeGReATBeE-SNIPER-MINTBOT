import { PrismaClient } from '@prisma/client';
import { decryptPrivateKey } from './crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { PrivateKeyAccount } from 'viem';

const prisma = new PrismaClient();

/**
 * Retrieves and decrypts the default active wallet for a given user as a viem Account signer.
 */
export async function getDefaultSignerAccount(userId: string): Promise<PrivateKeyAccount> {
  const wallet = await prisma.wallet.findFirst({
    where: {
      userId,
      isDefault: true,
      isActive: true,
    },
  });

  if (!wallet) {
    throw new Error('No active default wallet found. Please generate or import a wallet first.');
  }

  const rawPrivateKey = decryptPrivateKey(wallet.encryptedKey) as `0x${string}`;
  return privateKeyToAccount(rawPrivateKey);
}

/**
 * Retrieves any specific active wallet by ID as a viem Account signer.
 */
export async function getSignerAccountById(walletId: string): Promise<PrivateKeyAccount> {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
  });

  if (!wallet || !wallet.isActive) {
    throw new Error('Wallet not found or is currently inactive.');
  }

  const rawPrivateKey = decryptPrivateKey(wallet.encryptedKey) as `0x${string}`;
  return privateKeyToAccount(rawPrivateKey);
}
