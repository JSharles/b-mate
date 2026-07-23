import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// AES-256-GCM: the developer's GitHub PAT must be recoverable in full to call
// GitHub's API later, so it's encrypted (reversible), not hashed like a
// password. See specs/005-github-project-connection research.md Decision 4.
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const key = process.env.BOARD_CONNECTION_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('BOARD_CONNECTION_ENCRYPTION_KEY is not set');
  }
  return Buffer.from(key, 'hex');
}

// Output packs iv + authTag + ciphertext into one base64 string so the
// column stays a single value — no separate iv/tag columns to keep in sync.
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

export function decryptToken(encoded: string): string {
  const data = Buffer.from(encoded, 'base64');
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}
