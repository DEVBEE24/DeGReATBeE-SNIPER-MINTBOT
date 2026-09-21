import { pool, queryOne } from '../config/database';
import { encryptPrivateKey } from './crypto';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { Wallet } from '../types/database';

export async function createWalletForUser(userId: string, label?: string): Promise<Wallet> {
  const rawKey = generatePrivateKey();
  const account = privateKeyToAccount(rawKey);
  const encryptedKey = encryptPrivateKey(rawKey);

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS count FROM wallets WHERE user_id = $1`,
    [userId]
  );
  const count = countResult.rows[0]?.count ?? 0;

  const wallet = await queryOne<Wallet>(
    `INSERT INTO wallets (user_id, address, encrypted_key, label, is_default, is_active)
     VALUES ($1, $2, $3, $4, $5, true) RETURNING *`,
    [userId, account.address, encryptedKey, label || `Sniper Wallet #${count + 1}`, count === 0]
  );

  if (!wallet) throw new Error('Failed to create wallet');
  return wallet;
}
