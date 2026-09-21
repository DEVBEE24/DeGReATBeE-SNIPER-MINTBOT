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
  ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('[Database] Unexpected pool error:', err.message);
});

export async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          telegram_id VARCHAR(255) UNIQUE NOT NULL,
          username VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_settings (
          id SERIAL PRIMARY KEY,
          user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          priority_gwei VARCHAR(50) DEFAULT '3.0',
          max_eth_cap VARCHAR(50) DEFAULT '0.05',
          slippage_tolerance INTEGER DEFAULT 1,
          auto_mint_active BOOLEAN DEFAULT FALSE,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS wallets (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          label VARCHAR(100) NOT NULL,
          address VARCHAR(255) NOT NULL,
          encrypted_key TEXT NOT NULL,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS chain_toggles (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          chain_name VARCHAR(50) NOT NULL,
          enabled BOOLEAN DEFAULT TRUE,
          UNIQUE(user_id, chain_name)
      );

      CREATE TABLE IF NOT EXISTS mint_schedules (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          chain_name VARCHAR(50) NOT NULL,
          contract_address VARCHAR(255) NOT NULL,
          value_wei VARCHAR(100) DEFAULT '0',
          target_timestamp TIMESTAMP,
          target_block BIGINT,
          executed BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS whale_targets (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          chain_name VARCHAR(50) NOT NULL,
          address VARCHAR(255) NOT NULL,
          label VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS watchlist_targets (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          chain_name VARCHAR(50) NOT NULL,
          contract_address VARCHAR(255) NOT NULL,
          status VARCHAR(50) DEFAULT 'staged',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('[Database] 🟢 All database tables verified and initialized successfully.');
  } finally {
    client.release();
  }
}

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
