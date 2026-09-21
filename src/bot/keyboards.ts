import { InlineKeyboard } from 'grammy';

export function getMainDashboardKeyboard(autoMintActive: boolean = false): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔍 Scan Contract', 'menu_scan').text('👁️ Watchlist', 'menu_watchlist').row()
    .text('💼 My Wallets', 'menu_wallets').text('⚙️ Chains', 'menu_chains').row()
    .text('🖼️ Portfolio', 'menu_portfolio').text('🎯 Tracking', 'menu_tracking').row()
    .text('⏰ Schedules', 'menu_schedules').text('🛡️ Settings', 'menu_settings').row()
    .text('📖 Help', 'menu_help').row()
    .text(autoMintActive ? '⚡ Auto-Mint: ON' : '⚡ Auto-Mint: OFF', 'menu_toggle_automint');
}

export const backToMenuKeyboard = new InlineKeyboard().text('🏠 Main Menu', 'menu_main');

export function getChainSubscriptionsKeyboard(chains: { chain_name: string; enabled: boolean }[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  chains.forEach((chain) => {
    const checkmark = chain.enabled ? '✅' : '❌';
    keyboard.text(`${checkmark} ${chain.chain_name.toUpperCase()}`, `toggle_chain_${chain.chain_name}`).row();
  });

  keyboard.text('🏠 Main Menu', 'menu_main');
  return keyboard;
}

export function getWalletManagementKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🎲 Generate Fresh Wallet', 'menu_generate_wallet').row()
    .text('➕ Import Private Key', 'menu_import_info').row()
    .text('🏠 Main Menu', 'menu_main');
}

export function getWalletListKeyboard(wallets: any[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  wallets.forEach((w: any, index: number) => {
    keyboard.text(`🔑 Export #${index + 1}`, `wallet_export_${w.id}`)
            .text(`⚡ Toggle #${index + 1}`, `wallet_toggle_${w.id}`).row();
  });
  keyboard.text('🎲 Generate Fresh Wallet', 'menu_generate_wallet').row()
          .text('➕ Import Key (/addwallet)', 'menu_import_info').row()
          .text('🏠 Main Menu', 'menu_main');
  return keyboard;
}

export function getSettingsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('⚡ Priority: 2 Gwei', 'set_gwei_2').text('⚡ Priority: 5 Gwei', 'set_gwei_5').row()
    .text('⚡ Priority: 10 Gwei', 'set_gwei_10').row()
    .text('🛡️ Cap: 0.02 ETH', 'set_cap_0.02').text('🛡️ Cap: 0.05 ETH', 'set_cap_0.05').row()
    .text('🛡️ Cap: 0.1 ETH', 'set_cap_0.1').row()
    .text('🏠 Main Menu', 'menu_main');
}

export function getScheduleListKeyboard(schedules: any[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  schedules.forEach((s: any) => {
    const statusIcon = s.status === 'pending' ? '⏳' : s.status === 'completed' ? '✅' : s.status === 'failed' ? '❌' : '🔄';
    keyboard.text(`${statusIcon} ${s.chain_name.toUpperCase()} - ${s.contract_address.slice(0, 8)}...`, `schedule_detail_${s.id}`).row();
  });
  keyboard.text('🏠 Main Menu', 'menu_main');
  return keyboard;
}

export function getWatchlistKeyboard(targets: any[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  targets.forEach((t: any) => {
    keyboard.text(`👁️ ${t.chain_name.toUpperCase()} - ${t.contract_address.slice(0, 8)}...`, `watchlist_detail_${t.id}`)
            .text(`🗑 Remove`, `watchlist_remove_${t.id}`).row();
  });
  keyboard.text('🏠 Main Menu', 'menu_main');
  return keyboard;
}

export function getInterceptKeyboard(chainName: string, address: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔍 Full Audit', `intercept_scan_${chainName}_${address}`)
    .text('👁️ Add to Watchlist', `intercept_watch_${chainName}_${address}`).row()
    .text('🚀 Quick Mint (0 ETH)', `intercept_mint_${chainName}_${address}_0`)
    .text('💰 Mint (0.01 ETH)', `intercept_mint_${chainName}_${address}_0.01`).row()
    .text('⏰ Schedule Mint', `intercept_schedule_${chainName}_${address}`).row()
    .text('🏠 Main Menu', 'menu_main');
}
