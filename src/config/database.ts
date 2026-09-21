import { Pool, PoolClient } from 'pg';

const connectionString = process.env.DATABASE_URL || '';

if (!connectionString) {
  throw new Error('CRITICAL: DATABASE_URL is not defined in environment variables.');
}

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[Database] Unexpected pool error:', err.message);
});

export async function query<T extends Record<string, any> = Record<string, any>>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends Record<string, any> = Record<string, any>>(
  text: string,
  params?: any[]
): Promise<T | null> {
  const result = await pool.query<T>(text, params);
  return result.rows[0] || null;
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
