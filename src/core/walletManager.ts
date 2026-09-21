import { query, queryOne } from '../config/database';
import { decryptPrivateKey } from './crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { PrivateKeyAccount } from 'viem';
import { Wallet } from '../types/database';

export async function getDefaultSignerAccount(userId: string): Promise<PrivateKeyAccount> {
  const wallet = await queryOne<Wallet>(
    `SELECT * FROM wallets WHERE user_id = $1 AND is_default = true AND is_active = true LIMIT 1`,
    [userId]
  );

  if (!wallet) {
    throw new Error('No active default wallet found. Please generate or import a wallet first.');
  }

  const rawPrivateKey = decryptPrivateKey(wallet.encrypted_key) as `0x${string}`;
  return privateKeyToAccount(rawPrivateKey);
}

export async function getSignerAccountById(walletId: string): Promise<PrivateKeyAccount> {
  const wallet = await queryOne<Wallet>(
    `SELECT * FROM wallets WHERE id = $1 LIMIT 1`,
    [walletId]
  );

  if (!wallet || !wallet.is_active) {
    throw new Error('Wallet not found or is currently inactive.');
  }

  const rawPrivateKey = decryptPrivateKey(wallet.encrypted_key) as `0x${string}`;
  return privateKeyToAccount(rawPrivateKey);
}

export async function getDefaultWallet(userId: string): Promise<Wallet | null> {
  return queryOne<Wallet>(
    `SELECT * FROM wallets WHERE user_id = $1 AND is_default = true AND is_active = true LIMIT 1`,
    [userId]
  );
}

export async function getWalletsByUser(userId: string): Promise<Wallet[]> {
  return query<Wallet>(
    `SELECT * FROM wallets WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId]
  );
}
