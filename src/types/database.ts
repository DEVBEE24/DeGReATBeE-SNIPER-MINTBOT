export interface User {
  id: string;
  telegram_id: string;
  username: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  id: string;
  user_id: string;
  priority_gwei: string;
  max_eth_cap: string;
  default_gas_limit: string;
  slippage_tolerance: number;
  auto_mint_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Wallet {
  id: string;
  user_id: string;
  address: string;
  encrypted_key: string;
  label: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

export interface WhaleTarget {
  id: string;
  user_id: string;
  chain_name: string;
  address: string;
  label: string;
  created_at: string;
}

export interface ChainToggle {
  id: string;
  user_id: string;
  chain_name: string;
  enabled: boolean;
  created_at: string;
}

export interface MintSchedule {
  id: string;
  user_id: string;
  chain_name: string;
  contract_address: string;
  function_name: string;
  value_wei: string;
  execute_at: string | null;
  target_block: number | null;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled';
  tx_hash: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface WatchlistTarget {
  id: string;
  user_id: string;
  chain_name: string;
  contract_address: string;
  label: string;
  last_risk_level: string | null;
  last_scanned_at: string | null;
  created_at: string;
}

export interface UserWithRelations extends User {
  settings: UserSettings | null;
  wallets: Wallet[];
  whale_targets: WhaleTarget[];
  chain_toggles: ChainToggle[];
}

export const SUPPORTED_NETWORKS = [
  { chainName: 'base', name: 'Base' },
  { chainName: 'ethereum', name: 'Ethereum' },
  { chainName: 'robinhood', name: 'Robinhood Chain' },
  { chainName: 'ink', name: 'Ink' },
  { chainName: 'arc', name: 'Arc' },
] as const;
