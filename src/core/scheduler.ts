import { supabase } from '../config/supabase';
import { dispatchMintTransaction } from './dispatcher';
import { createPublicClient, http, Address } from 'viem';
import { getChainConfig } from '../config/chains';
import { MintSchedule, UserSettings, Wallet } from '../types/database';

let schedulerInterval: NodeJS.Timeout | null = null;

export function startScheduler(intervalMs: number = 10_000) {
  if (schedulerInterval) return;
  console.log('[Scheduler] 🕐 Mint scheduler started.');
  schedulerInterval = setInterval(tick, intervalMs);
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[Scheduler] Stopped.');
  }
}

async function tick() {
  try {
    await processTimeSchedules();
    await processBlockSchedules();
  } catch (err: any) {
    console.error('[Scheduler] Tick error:', err.message || err);
  }
}

async function processTimeSchedules() {
  const now = new Date().toISOString();
  const { data: schedules, error } = await supabase
    .from('mint_schedules')
    .select('*')
    .eq('status', 'pending')
    .not('execute_at', 'is', null)
    .lte('execute_at', now);

  if (error || !schedules) return;

  await Promise.all(schedules.map((s) => executeSchedule(s as MintSchedule)));
}

async function processBlockSchedules() {
  const { data: schedules, error } = await supabase
    .from('mint_schedules')
    .select('*')
    .eq('status', 'pending')
    .not('target_block', 'is', null);

  if (error || !schedules || schedules.length === 0) return;

  const byChain = new Map<string, MintSchedule[]>();
  for (const s of schedules as MintSchedule[]) {
    const list = byChain.get(s.chain_name) || [];
    list.push(s);
    byChain.set(s.chain_name, list);
  }

  await Promise.all(
    Array.from(byChain.entries()).map(async ([chainName, chainSchedules]) => {
      try {
        const chain = getChainConfig(chainName);
        const client = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0], { timeout: 8_000 }) });
        const currentBlock = await client.getBlockNumber();

        const due = chainSchedules.filter((s) => s.target_block !== null && BigInt(s.target_block) <= currentBlock);
        await Promise.all(due.map((s) => executeSchedule(s)));
      } catch (err: any) {
        console.error(`[Scheduler] Block check error for ${chainName}:`, err.message || err);
      }
    })
  );
}

async function executeSchedule(schedule: MintSchedule) {
  try {
    await supabase
      .from('mint_schedules')
      .update({ status: 'executing' })
      .eq('id', schedule.id);

    const { data: wallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', schedule.user_id)
      .eq('is_default', true)
      .eq('is_active', true)
      .maybeSingle();

    if (!wallet) {
      await supabase
        .from('mint_schedules')
        .update({ status: 'failed', error_message: 'No active default wallet found.' })
        .eq('id', schedule.id);
      return;
    }

    const { data: settings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', schedule.user_id)
      .maybeSingle();

    const result = await dispatchMintTransaction({
      encryptedPrivateKey: (wallet as Wallet).encrypted_key,
      chainName: schedule.chain_name,
      contractAddress: schedule.contract_address as Address,
      abi: [{ inputs: [], name: schedule.function_name, outputs: [], stateMutability: 'payable', type: 'function' }],
      functionName: schedule.function_name,
      args: [],
      valueWei: BigInt(schedule.value_wei),
      maxPriorityFeeGwei: (settings as UserSettings)?.priority_gwei || '3.0',
      maxFeePerGasGwei: '30.0',
      maxEthCap: (settings as UserSettings)?.max_eth_cap || '0.05',
    });

    if (result.success) {
      await supabase
        .from('mint_schedules')
        .update({ status: 'completed', tx_hash: result.txHash })
        .eq('id', schedule.id);
      console.log(`[Scheduler] ✅ Schedule ${schedule.id} executed. Tx: ${result.txHash}`);
    } else {
      await supabase
        .from('mint_schedules')
        .update({ status: 'failed', error_message: result.error })
        .eq('id', schedule.id);
      console.error(`[Scheduler] ❌ Schedule ${schedule.id} failed: ${result.error}`);
    }
  } catch (err: any) {
    try {
      await supabase
        .from('mint_schedules')
        .update({ status: 'failed', error_message: err.message })
        .eq('id', schedule.id);
    } catch {
      // Best-effort status update; avoid unhandled rejection if the update itself fails
    }
    console.error(`[Scheduler] ❌ Schedule ${schedule.id} error:`, err.message || err);
  }
}

export async function createSchedule(params: {
  userId: string;
  chainName: string;
  contractAddress: string;
  functionName: string;
  valueWei: string;
  executeAt?: string | null;
  targetBlock?: number | null;
}): Promise<MintSchedule> {
  const { data, error } = await supabase
    .from('mint_schedules')
    .insert({
      user_id: params.userId,
      chain_name: params.chainName,
      contract_address: params.contractAddress,
      function_name: params.functionName,
      value_wei: params.valueWei,
      execute_at: params.executeAt || null,
      target_block: params.targetBlock || null,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return data as MintSchedule;
}

export async function getSchedulesByUser(userId: string): Promise<MintSchedule[]> {
  const { data, error } = await supabase
    .from('mint_schedules')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw error;
  return (data || []) as MintSchedule[];
}

export async function cancelSchedule(scheduleId: string): Promise<void> {
  const { error } = await supabase
    .from('mint_schedules')
    .update({ status: 'cancelled' })
    .eq('id', scheduleId)
    .eq('status', 'pending');

  if (error) throw error;
}
