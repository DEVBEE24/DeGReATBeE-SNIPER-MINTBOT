import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

// Retrieves the encryption master key from environment variables
function getMasterKey(): Buffer {
  const secret = process.env.ENCRYPTION_MASTER_KEY;
  if (!secret) {
    throw new Error('CRITICAL: ENCRYPTION_MASTER_KEY is not defined in environment variables.');
  }
  // Hash the secret to ensure it's precisely 32 bytes for AES-256
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts a raw private key string using AES-256-GCM.
 */
export function encryptPrivateKey(rawKey: string): string {
  const iv = crypto.randomBytes(12); // 12 bytes IV for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, getMasterKey(), iv);
  
  let encrypted = cipher.update(rawKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();

  // Return formatted string containing IV, Auth Tag, and Ciphertext
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts an encrypted private key string back to its raw format.
 */
export function decryptPrivateKey(encryptedData: string): string {
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted private key format.');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encryptedText = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, getMasterKey(), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
