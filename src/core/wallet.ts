import { supabase } from '../config/supabase';
import { encryptPrivateKey } from './crypto';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { Wallet } from '../types/database';

export async function createWalletForUser(userId: string, label?: string): Promise<Wallet> {
  const rawKey = generatePrivateKey();
  const account = privateKeyToAccount(rawKey);
  const encryptedKey = encryptPrivateKey(rawKey);

  const { data: existingWallets, error: countError } = await supabase
    .from('wallets')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (countError) throw countError;
  const count = existingWallets?.length ?? 0;

  const { data, error } = await supabase
    .from('wallets')
    .insert({
      user_id: userId,
      address: account.address,
      encrypted_key: encryptedKey,
      label: label || `Sniper Wallet #${count + 1}`,
      is_default: count === 0,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Wallet;
}
