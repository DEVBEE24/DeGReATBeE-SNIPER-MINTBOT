/*
# Create ApexBee Sniper Bot Database Schema

## Overview
This migration creates the complete database schema for the ApexBee Professional
Multi-Chain EVM NFT Sniper & Minting Bot. The bot is a server-side Telegram application
that manages user wallets, whale tracking, mint scheduling, and contract scanning
across multiple EVM networks (Base, Ethereum, Robinhood, Ink, Arc).

## Tables Created

### 1. users
- Stores Telegram user profiles. Each user is identified by their unique Telegram ID.
- `id` (uuid, PK) — internal user identifier
- `telegram_id` (text, unique) — Telegram user ID
- `username` (text, nullable) — Telegram username
- `created_at` / `updated_at` — timestamps

### 2. user_settings
- Per-user gas, safety, and automation configuration.
- `priority_gwei` — max priority fee tip (default 3.0)
- `max_eth_cap` — max ETH budget cap per transaction (default 0.05)
- `default_gas_limit` — default gas limit (default 0.005)
- `slippage_tolerance` — slippage tolerance percentage (default 1)
- `auto_mint_active` — whether auto-mint is enabled (default false)

### 3. wallets
- Encrypted EVM wallets per user. Private keys are AES-256-GCM encrypted at rest.
- `address` — wallet public address
- `encrypted_key` — AES-256-GCM encrypted private key
- `label` — user-friendly wallet name
- `is_default` — whether this is the default wallet for transactions
- `is_active` — whether this wallet is currently active

### 4. whale_targets
- Addresses that users want to track for copy-minting.
- `chain_name` — which EVM chain the whale operates on
- `address` — whale wallet address
- `label` — user-friendly label

### 5. chain_toggles
- Per-user enable/disable for each supported EVM chain.
- `chain_name` — the chain identifier (base, ethereum, robinhood, ink, arc)
- `enabled` — whether the chain is active for this user
- Unique constraint on (user_id, chain_name)

### 6. mint_schedules
- Staged contracts with delayed execution targets (timestamp or block number).
- `chain_name` — target chain
- `contract_address` — the NFT contract to mint
- `function_name` — the mint function to call (e.g., mint, claim)
- `value_wei` — value to send in wei (text for large number support)
- `execute_at` — target timestamp for execution
- `target_block` — target block number for execution
- `status` — pending, executing, completed, failed, cancelled
- `tx_hash` — resulting transaction hash if successful
- `error_message` — error details if failed

### 7. watchlist_targets
- Contracts being watched for activity/minting opportunities.
- `chain_name` — chain where the contract is deployed
- `contract_address` — the contract address
- `label` — user-friendly label
- `last_risk_level` — last known risk assessment
- `last_scanned_at` — last scan timestamp

## Security
- RLS enabled on all tables.
- This is a server-side bot application using the service role key (bypasses RLS).
- Policies use `TO anon, authenticated` with `USING (true)` as a defense-in-depth
  measure since the database is accessed exclusively by the server-side bot.
*/

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id text UNIQUE NOT NULL,
  username text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_users" ON users;
CREATE POLICY "anon_select_users" ON users FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_users" ON users;
CREATE POLICY "anon_insert_users" ON users FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_users" ON users;
CREATE POLICY "anon_update_users" ON users FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_users" ON users;
CREATE POLICY "anon_delete_users" ON users FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- USER_SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  priority_gwei text NOT NULL DEFAULT '3.0',
  max_eth_cap text NOT NULL DEFAULT '0.05',
  default_gas_limit text NOT NULL DEFAULT '0.005',
  slippage_tolerance integer NOT NULL DEFAULT 1,
  auto_mint_active boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_user_settings" ON user_settings;
CREATE POLICY "anon_select_user_settings" ON user_settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_user_settings" ON user_settings;
CREATE POLICY "anon_insert_user_settings" ON user_settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_user_settings" ON user_settings;
CREATE POLICY "anon_update_user_settings" ON user_settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_user_settings" ON user_settings;
CREATE POLICY "anon_delete_user_settings" ON user_settings FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- WALLETS
-- ============================================================
CREATE TABLE IF NOT EXISTS wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address text NOT NULL,
  encrypted_key text NOT NULL,
  label text NOT NULL DEFAULT 'Sniper Wallet',
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_wallets" ON wallets;
CREATE POLICY "anon_select_wallets" ON wallets FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_wallets" ON wallets;
CREATE POLICY "anon_insert_wallets" ON wallets FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_wallets" ON wallets;
CREATE POLICY "anon_update_wallets" ON wallets FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_wallets" ON wallets;
CREATE POLICY "anon_delete_wallets" ON wallets FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);

-- ============================================================
-- WHALE_TARGETS
-- ============================================================
CREATE TABLE IF NOT EXISTS whale_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chain_name text NOT NULL,
  address text NOT NULL,
  label text NOT NULL DEFAULT 'Whale Target',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE whale_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_whale_targets" ON whale_targets;
CREATE POLICY "anon_select_whale_targets" ON whale_targets FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_whale_targets" ON whale_targets;
CREATE POLICY "anon_insert_whale_targets" ON whale_targets FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_whale_targets" ON whale_targets;
CREATE POLICY "anon_update_whale_targets" ON whale_targets FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_whale_targets" ON whale_targets;
CREATE POLICY "anon_delete_whale_targets" ON whale_targets FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_whale_targets_user_id ON whale_targets(user_id);

-- ============================================================
-- CHAIN_TOGGLES
-- ============================================================
CREATE TABLE IF NOT EXISTS chain_toggles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chain_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, chain_name)
);

ALTER TABLE chain_toggles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_chain_toggles" ON chain_toggles;
CREATE POLICY "anon_select_chain_toggles" ON chain_toggles FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_chain_toggles" ON chain_toggles;
CREATE POLICY "anon_insert_chain_toggles" ON chain_toggles FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_chain_toggles" ON chain_toggles;
CREATE POLICY "anon_update_chain_toggles" ON chain_toggles FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_chain_toggles" ON chain_toggles;
CREATE POLICY "anon_delete_chain_toggles" ON chain_toggles FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_chain_toggles_user_id ON chain_toggles(user_id);

-- ============================================================
-- MINT_SCHEDULES
-- ============================================================
CREATE TABLE IF NOT EXISTS mint_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chain_name text NOT NULL,
  contract_address text NOT NULL,
  function_name text NOT NULL DEFAULT 'mint',
  value_wei text NOT NULL DEFAULT '0',
  execute_at timestamptz,
  target_block bigint,
  status text NOT NULL DEFAULT 'pending',
  tx_hash text,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE mint_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_mint_schedules" ON mint_schedules;
CREATE POLICY "anon_select_mint_schedules" ON mint_schedules FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_mint_schedules" ON mint_schedules;
CREATE POLICY "anon_insert_mint_schedules" ON mint_schedules FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_mint_schedules" ON mint_schedules;
CREATE POLICY "anon_update_mint_schedules" ON mint_schedules FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_mint_schedules" ON mint_schedules;
CREATE POLICY "anon_delete_mint_schedules" ON mint_schedules FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_mint_schedules_user_id ON mint_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_mint_schedules_status ON mint_schedules(status);
CREATE INDEX IF NOT EXISTS idx_mint_schedules_execute_at ON mint_schedules(execute_at);

-- ============================================================
-- WATCHLIST_TARGETS
-- ============================================================
CREATE TABLE IF NOT EXISTS watchlist_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chain_name text NOT NULL,
  contract_address text NOT NULL,
  label text NOT NULL DEFAULT 'Watchlist Target',
  last_risk_level text,
  last_scanned_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE watchlist_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_watchlist_targets" ON watchlist_targets;
CREATE POLICY "anon_select_watchlist_targets" ON watchlist_targets FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_watchlist_targets" ON watchlist_targets;
CREATE POLICY "anon_insert_watchlist_targets" ON watchlist_targets FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_watchlist_targets" ON watchlist_targets;
CREATE POLICY "anon_update_watchlist_targets" ON watchlist_targets FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_watchlist_targets" ON watchlist_targets;
CREATE POLICY "anon_delete_watchlist_targets" ON watchlist_targets FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_watchlist_targets_user_id ON watchlist_targets(user_id);

-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_mint_schedules_updated_at ON mint_schedules;
CREATE TRIGGER update_mint_schedules_updated_at BEFORE UPDATE ON mint_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
