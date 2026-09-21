import dotenv from 'dotenv';
dotenv.config();

import { startTelegramBot } from './bot/telegramBot.js';

async function main() {
  console.log('[Main] 🚀 Initializing ApexBee Professional Sniper Engine...');
  
  try {
    startTelegramBot();
    console.log('[Main] 💎 All background services and bot handlers successfully loaded.');
  } catch (err) {
    console.error('[Main] ❌ Critical startup failure:', err);
    process.exit(1);
  }
}

main();
