import { InlineKeyboard } from 'grammy';

/**
 * Centralized Keyboard Factory for ApexBee Sniper Engine
 * Mirrors the modular layout and checkmark architecture of your production system.
 */

// 1. Main Dashboard Control Panel
export function getMainDashboardKeyboard(autoMintActive: boolean = false): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔍 Scan Contract", "menu_scan").text("👁️ Watchlist", "menu_watchlist").row()
    .text("💼 My Wallets", "menu_wallets").text("⚙️ Chains Hub", "menu_chains").row()
    .text("🖼️ My Portfolio", "menu_portfolio").text("🎯 Tracking", "menu_tracking").row()
    .text("🛡️ Settings / Gas", "menu_settings").text("📖 Help", "menu_help").row()
    .text(autoMintActive ? "⚡ Auto-Mint: ON" : "⚡ Auto-Mint: OFF", "menu_toggle_automint");
}

// 2. Universal Back to Menu Button
export const backToMenuKeyboard = new InlineKeyboard().text("🏠 Main Menu", "menu_main");

// 3. Chain Subscriptions Hub (Checkmark Toggles)
export function getChainSubscriptionsKeyboard(chainStates: { chainName: string; enabled: boolean }[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  
  chainStates.forEach((chain) => {
    const checkmark = chain.enabled ? '✅' : '❌';
    keyboard.text(`${checkmark} ${chain.chainName.toUpperCase()}`, `toggle_chain_${chain.chainName}`).row();
  });

  keyboard.text("🏠 Main Menu", "menu_main");
  return keyboard;
}

// 4. Wallet Management Action Sheet
export function getWalletManagementKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🎲 Generate Fresh Wallet", "menu_generate_wallet").row()
    .text("📥 Import Private Key", "menu_import_info").row()
    .text("🏠 Main Menu", "menu_main");
}
