import dotenv from 'dotenv';
import { startTelegramBot } from './bot/telegramBot';

dotenv.config();

function main() {
  console.log('[Engine] 🚀 Starting Mint-Executor-Engine...');
  startTelegramBot();
}

main();
