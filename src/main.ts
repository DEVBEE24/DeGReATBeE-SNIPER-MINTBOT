import dotenv from 'dotenv';
dotenv.config();

import { startTelegramBot } from './bot/telegramBot.js';
import { startScheduler } from './core/scheduler.js';

async function main() {
  console.log('[Main] 🚀 Initializing ApexBee Professional Sniper Engine...');

  try {
    startScheduler();
    startTelegramBot();
    console.log('[Main] 💎 All background services and bot handlers successfully loaded.');
  } catch (err) {
    console.error('[Main] ❌ Critical startup failure:', err);
    process.exit(1);
  }
}

main();
