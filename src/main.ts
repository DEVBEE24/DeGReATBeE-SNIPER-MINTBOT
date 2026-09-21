import dotenv from 'dotenv';
dotenv.config();

import { initDatabase } from './config/database.js'; // Adjust path if your database.ts is in a different folder
import { startTelegramBot } from './bot/telegramBot.js';
import { startScheduler } from './core/scheduler.js';

async function main() {
  console.log('[Main] 🚀 Initializing ApexBee Professional Sniper Engine...');

  try {
    // Automatically verify and provision database tables before booting background tasks
    await initDatabase();

    startScheduler();
    startTelegramBot();
    console.log('[Main] 💎 All background services and bot handlers successfully loaded.');
  } catch (err) {
    console.error('[Main] ❌ Critical startup failure:', err);
    process.exit(1);
  }
}

main();
