import { pool, query, queryOne } from '../config/database';
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
  const schedules = await query<MintSchedule>(
    `SELECT * FROM mint_schedules WHERE status = 'pending' AND execute_at IS NOT NULL AND execute_at <= $1`,
    [now]
  );

  await Promise.all(schedules.map((s) => executeSchedule(s)));
}

async function processBlockSchedules() {
  const schedules = await query<MintSchedule>(
    `SELECT * FROM mint_schedules WHERE status = 'pending' AND target_block IS NOT NULL`
  );

  if (schedules.length === 0) return;

  const byChain = new Map<string, MintSchedule[]>();
  for (const s of schedules) {
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
    await pool.query(
      `UPDATE mint_schedules SET status = 'executing' WHERE id = $1`,
      [schedule.id]
    );

    const wallet = await queryOne<Wallet>(
      `SELECT * FROM wallets WHERE user_id = $1 AND is_default = true AND is_active = true LIMIT 1`,
      [schedule.user_id]
    );

    if (!wallet) {
      await pool.query(
        `UPDATE mint_schedules SET status = 'failed', error_message = 'No active default wallet found.' WHERE id = $1`,
        [schedule.id]
      );
      return;
    }

    const settings = await queryOne<UserSettings>(
      `SELECT * FROM user_settings WHERE user_id = $1 LIMIT 1`,
      [schedule.user_id]
    );

    const result = await dispatchMintTransaction({
      encryptedPrivateKey: wallet.encrypted_key,
      chainName: schedule.chain_name,
      contractAddress: schedule.contract_address as Address,
      abi: [{ inputs: [], name: schedule.function_name, outputs: [], stateMutability: 'payable', type: 'function' }],
      functionName: schedule.function_name,
      args: [],
      valueWei: BigInt(schedule.value_wei),
      maxPriorityFeeGwei: settings?.priority_gwei || '3.0',
      maxFeePerGasGwei: '30.0',
      maxEthCap: settings?.max_eth_cap || '0.05',
    });

    if (result.success) {
      await pool.query(
        `UPDATE mint_schedules SET status = 'completed', tx_hash = $2 WHERE id = $1`,
        [schedule.id, result.txHash]
      );
      console.log(`[Scheduler] ✅ Schedule ${schedule.id} executed. Tx: ${result.txHash}`);
    } else {
      await pool.query(
        `UPDATE mint_schedules SET status = 'failed', error_message = $2 WHERE id = $1`,
        [schedule.id, result.error]
      );
      console.error(`[Scheduler] ❌ Schedule ${schedule.id} failed: ${result.error}`);
    }
  } catch (err: any) {
    try {
      await pool.query(
        `UPDATE mint_schedules SET status = 'failed', error_message = $2 WHERE id = $1`,
        [schedule.id, err.message]
      );
    } catch {
      // Best-effort status update
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
  const schedule = await queryOne<MintSchedule>(
    `INSERT INTO mint_schedules (user_id, chain_name, contract_address, function_name, value_wei, execute_at, target_block, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING *`,
    [
      params.userId,
      params.chainName,
      params.contractAddress,
      params.functionName,
      params.valueWei,
      params.executeAt || null,
      params.targetBlock || null,
    ]
  );

  if (!schedule) throw new Error('Failed to create schedule');
  return schedule;
}

export async function getSchedulesByUser(userId: string): Promise<MintSchedule[]> {
  return query<MintSchedule>(
    `SELECT * FROM mint_schedules WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [userId]
  );
}

export async function cancelSchedule(scheduleId: string): Promise<void> {
  const result = await pool.query(
    `UPDATE mint_schedules SET status = 'cancelled' WHERE id = $1 AND status = 'pending'`,
    [scheduleId]
  );

  if (result.rowCount === 0) {
    throw new Error('Schedule not found or not in pending status.');
  }
}
