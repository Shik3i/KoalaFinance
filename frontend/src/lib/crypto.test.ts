import { describe, it, expect } from 'vitest';
import {
  generateUserKeyPair,
  deriveKeyFromPassword,
  deriveKeyFromRecoveryKey,
  encryptPrivateKey,
  decryptPrivateKey,
  generateVaultKey,
  wrapVaultKey,
  unwrapVaultKey,
  encryptRecordPayload,
  decryptRecordPayload,
  encodeBase32,
  decodeBase32,
  generateRandomRecoveryBytes,
} from './crypto';

describe('Base32 Grouped Recovery Keys', () => {
  it('should encode 32 bytes of random entropy to exactly 52 characters grouped with hyphens', () => {
    const bytes = generateRandomRecoveryBytes();
    expect(bytes.length).toBe(32);

    const encoded = encodeBase32(bytes);
    // 52 base32 characters + 12 hyphens = 64 characters total
    expect(encoded.length).toBe(64);

    const normalized = encoded.replace(/-/g, '');
    expect(normalized.length).toBe(52);
    expect(/^[A-Z2-7]{52}$/.test(normalized)).toBe(true);
  });

  it('should roundtrip encode and decode Base32 properly', () => {
    const originalBytes = new Uint8Array(32);
    originalBytes.fill(42);

    const encoded = encodeBase32(originalBytes);
    const decoded = decodeBase32(encoded);

    expect(decoded).toEqual(originalBytes);
  });

  it('should parse case-insensitively, ignore spaces and hyphens, and reject invalid inputs', () => {
    const originalBytes = new Uint8Array(32);
    originalBytes[0] = 255;
    originalBytes[31] = 127;

    const encoded = encodeBase32(originalBytes);
    // Modify to lowercase, insert random spaces/hyphens
    const modified = encoded.toLowerCase().replace(/-/g, ' - ');
    const decoded = decodeBase32(modified);

    expect(decoded).toEqual(originalBytes);

    // Reject invalid length
    expect(() => decodeBase32('ABCD-EFGH')).toThrow('Invalid recovery key length');
    
    // Reject invalid characters
    const invalidCharKey = '8' + encoded.substring(1);
    expect(() => decodeBase32(invalidCharKey)).toThrow();
  });
});

describe('Web Crypto Key Derivation and Wrapping', () => {
  it('should derive key from password and wrap/unwrap private key successfully', async () => {
    const password = 'mySuperStrongPassword123';
    const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

    // 1. Generate user key pair
    const keyPair = await generateUserKeyPair();
    expect(keyPair.publicKey.type).toBe('public');
    expect(keyPair.privateKey.type).toBe('private');

    // 2. Derive password key
    const derivedKey = await deriveKeyFromPassword(password, salt);

    // 3. Wrap private key
    const envelope = await encryptPrivateKey(keyPair.privateKey, derivedKey, salt);
    expect(envelope.cryptoVersion).toBe(1);
    expect(envelope.algorithm).toBe('AES-GCM-256');
    expect(envelope.kdf).toBe('PBKDF2-HMAC-SHA256');
    expect(envelope.kdfParams.iterations).toBe(600000);
    expect(envelope.nonce).toBeDefined();
    expect(envelope.payload).toBeDefined();

    // 4. Unwrap private key with correct password key
    const unwrappedPrivateKey = await decryptPrivateKey(envelope, derivedKey);
    expect(unwrappedPrivateKey.type).toBe('private');

    // 5. Unwrap with wrong password key should fail
    const wrongDerivedKey = await deriveKeyFromPassword('wrongPassword', salt);
    await expect(decryptPrivateKey(envelope, wrongDerivedKey)).rejects.toThrow();
  });

  it('should derive key from recovery key and wrap/unwrap private key successfully', async () => {
    const bytes = generateRandomRecoveryBytes();
    const recoveryKey = encodeBase32(bytes);
    const salt = new Uint8Array([8, 7, 6, 5, 4, 3, 2, 1, 8, 7, 6, 5, 4, 3, 2, 1]);

    const keyPair = await generateUserKeyPair();
    const derivedKey = await deriveKeyFromRecoveryKey(recoveryKey, salt);

    const envelope = await encryptPrivateKey(keyPair.privateKey, derivedKey, salt);

    const unwrappedPrivateKey = await decryptPrivateKey(envelope, derivedKey);
    expect(unwrappedPrivateKey.type).toBe('private');

    // Wrong recovery key should fail
    const wrongRecoveryBytes = generateRandomRecoveryBytes();
    wrongRecoveryBytes[0] ^= 1; // alter a bit
    const wrongRecoveryKey = encodeBase32(wrongRecoveryBytes);
    const wrongDerivedKey = await deriveKeyFromRecoveryKey(wrongRecoveryKey, salt);

    await expect(decryptPrivateKey(envelope, wrongDerivedKey)).rejects.toThrow();
  });
});

describe('Vault Keys and Record Encryption', () => {
  it('should wrap and unwrap vault key using RSA-OAEP-3072', async () => {
    const keyPair = await generateUserKeyPair();
    const vaultKey = await generateVaultKey();

    // Wrap
    const wrappedKeyBase64 = await wrapVaultKey(vaultKey, keyPair.publicKey);
    expect(wrappedKeyBase64).toBeDefined();

    // Unwrap
    const unwrappedVaultKey = await unwrapVaultKey(wrappedKeyBase64, keyPair.privateKey);
    expect(unwrappedVaultKey.type).toBe('secret');
  });

  it('should encrypt and decrypt a financial record payload successfully', async () => {
    const vaultKey = await generateVaultKey();
    const sampleRecord = {
      id: 'rec_1',
      name: 'Netflix subscription',
      amountMinor: 1799,
      currency: 'EUR',
      necessity: 'optional',
    };

    // Encrypt
    const envelope = await encryptRecordPayload(sampleRecord, vaultKey, 1);
    expect(envelope.cryptoVersion).toBe(1);
    expect(envelope.algorithm).toBe('AES-GCM-256');
    expect(envelope.nonce).toBeDefined();
    expect(envelope.payload).toBeDefined();
    expect(envelope.schemaVersion).toBe(1);

    // Decrypt
    const decryptedRecord = await decryptRecordPayload(envelope, vaultKey);
    expect(decryptedRecord).toEqual(sampleRecord);

    // Decrypt with a different vault key should fail
    const wrongVaultKey = await generateVaultKey();
    await expect(decryptRecordPayload(envelope, wrongVaultKey)).rejects.toThrow();
  });
});
