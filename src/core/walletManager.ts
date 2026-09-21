import { supabase } from '../config/supabase';
import { decryptPrivateKey } from './crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { PrivateKeyAccount } from 'viem';
import { Wallet } from '../types/database';

export async function getDefaultSignerAccount(userId: string): Promise<PrivateKeyAccount> {
  const { data: wallet, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .eq('is_default', true)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;
  if (!wallet) {
    throw new Error('No active default wallet found. Please generate or import a wallet first.');
  }

  const rawPrivateKey = decryptPrivateKey((wallet as Wallet).encrypted_key) as `0x${string}`;
  return privateKeyToAccount(rawPrivateKey);
}

export async function getSignerAccountById(walletId: string): Promise<PrivateKeyAccount> {
  const { data: wallet, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('id', walletId)
    .maybeSingle();

  if (error) throw error;
  if (!wallet || !(wallet as Wallet).is_active) {
    throw new Error('Wallet not found or is currently inactive.');
  }

  const rawPrivateKey = decryptPrivateKey((wallet as Wallet).encrypted_key) as `0x${string}`;
  return privateKeyToAccount(rawPrivateKey);
}

export async function getDefaultWallet(userId: string): Promise<Wallet | null> {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .eq('is_default', true)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;
  return data as Wallet | null;
}

export async function getWalletsByUser(userId: string): Promise<Wallet[]> {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []) as Wallet[];
}
