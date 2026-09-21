import { PrismaClient } from '@prisma/client';
import { encryptPrivateKey } from './crypto';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

const prisma = new PrismaClient();

export async function createWalletForUser(userId: string, label?: string) {
  const rawKey = generatePrivateKey();
  const account = privateKeyToAccount(rawKey);
  const encryptedKey = encryptPrivateKey(rawKey);
  const count = await prisma.wallet.count({ where: { userId } });

  return prisma.wallet.create({
    data: {
      userId,
      address: account.address,
      encryptedKey,
      label: label || `Sniper Wallet #${count + 1}`,
      isDefault: count === 0,
      isActive: true,
    },
  });
}
