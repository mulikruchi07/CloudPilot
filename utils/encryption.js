// utils/encryption.js - AES-256-GCM credential encryption
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable must be set (32-byte hex string)');
  }
  const buf = Buffer.from(key, 'hex');
  if (buf.length !== 32) {
    throw new Error(`ENCRYPTION_KEY must be 32 bytes (64 hex chars). Got ${buf.length} bytes.`);
  }
  return buf;
}

/**
 * Encrypts a credentials object using AES-256-GCM
 * Returns { encrypted, iv, authTag } - all hex strings
 */
export function encryptCredential(credentialData) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(credentialData);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

/**
 * Decrypts a credential object
 * Input: { encrypted, iv, authTag } - all hex strings
 * Returns the original credential data object
 */
export function decryptCredential(encryptedData) {
  const key = getEncryptionKey();

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(encryptedData.iv, 'hex')
  );

  decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
}

/**
 * Generate a random 32-byte encryption key (for setup scripts)
 */
export function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}