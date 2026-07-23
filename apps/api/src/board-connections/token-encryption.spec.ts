import { decryptToken, encryptToken } from './token-encryption';

const ORIGINAL_ENV = process.env.BOARD_CONNECTION_ENCRYPTION_KEY;

describe('token-encryption', () => {
  beforeEach(() => {
    process.env.BOARD_CONNECTION_ENCRYPTION_KEY =
      '0000000000000000000000000000000000000000000000000000000000000000';
  });

  afterAll(() => {
    process.env.BOARD_CONNECTION_ENCRYPTION_KEY = ORIGINAL_ENV;
  });

  it('decrypts back to the original plaintext', () => {
    const encrypted = encryptToken('github_pat_super_secret_value');

    expect(decryptToken(encrypted)).toBe('github_pat_super_secret_value');
  });

  it('never stores the plaintext token in the encrypted output', () => {
    const encrypted = encryptToken('github_pat_super_secret_value');

    expect(encrypted).not.toContain('github_pat_super_secret_value');
  });

  it('produces different ciphertext for the same plaintext each time (random IV)', () => {
    const first = encryptToken('same-value');
    const second = encryptToken('same-value');

    expect(first).not.toBe(second);
    expect(decryptToken(first)).toBe('same-value');
    expect(decryptToken(second)).toBe('same-value');
  });

  it('throws when the ciphertext has been tampered with', () => {
    const encrypted = encryptToken('github_pat_super_secret_value');
    const tampered = encrypted.slice(0, -4) + 'abcd';

    expect(() => decryptToken(tampered)).toThrow();
  });

  it('throws when the encryption key is not set', () => {
    delete process.env.BOARD_CONNECTION_ENCRYPTION_KEY;

    expect(() => encryptToken('anything')).toThrow(
      'BOARD_CONNECTION_ENCRYPTION_KEY is not set',
    );
  });
});
