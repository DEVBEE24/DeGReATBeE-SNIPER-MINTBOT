import dotenv from 'dotenv';
dotenv.config();

import { startTelegramBot } from './bot/index.js';

console.log('[Main] 🚀 Initializing ApexBee Professional Sniper Engine...');

try {
  startTelegramBot();
} catch (err) {
  console.error('[Main] ❌ Critical startup error:', err);
}
