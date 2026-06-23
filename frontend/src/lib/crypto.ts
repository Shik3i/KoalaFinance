// Client-Side Cryptographic Module utilizing the Web Crypto API
// Configured for KoalaFinance (Phases 0-4)

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// --- Base32 Utilities for Recovery Keys ---

export function encodeBase32(buffer: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  // Group into blocks of 4 separated by hyphens (exactly 13 groups for 52 characters)
  const groups: string[] = [];
  for (let i = 0; i < output.length; i += 4) {
    groups.push(output.substring(i, i + 4));
  }
  return groups.join('-');
}

export function decodeBase32(str: string): Uint8Array {
  // Normalize: uppercase and remove spaces/hyphens
  const cleaned = str.toUpperCase().replace(/[\s-]/g, '');

  if (cleaned.length !== 52) {
    throw new Error('Invalid recovery key length. Must be exactly 52 characters.');
  }
  if (!/^[A-Z2-7]{52}$/.test(cleaned)) {
    throw new Error('Invalid recovery key characters. Only A-Z and 2-7 are allowed.');
  }

  let bits = 0;
  let value = 0;
  const output = new Uint8Array(32);
  let index = 0;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) throw new Error('Invalid recovery key character');

    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      if (index < 32) {
        output[index++] = (value >>> (bits - 8)) & 255;
      }
      bits -= 8;
    }
  }
  return output;
}

// --- Base64 / ArrayBuffer Utilities ---

export function arrayBufferToBase64(buffer: ArrayBuffer | ArrayBufferLike): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// --- Web Crypto Core Operations ---

// 1. Generate User Key Pair (RSA-OAEP-3072 / SHA-256)
export async function generateUserKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 3072,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true, // Extractable (we need to export private key wrapped, and public key plain)
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );
}

// 2. Derive Key from Password (PBKDF2-HMAC-SHA256, 600,000 iterations)
export async function deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as any,
      iterations: 600000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false, // Not extractable (keep key material inside VM memory)
    ['encrypt', 'decrypt']
  );
}

// 3. Derive Key from Recovery Key (uses its own salt and PBKDF2-HMAC-SHA256, 600,000 iterations)
export async function deriveKeyFromRecoveryKey(recoveryKeyBase32: string, salt: Uint8Array): Promise<CryptoKey> {
  const rawRecoveryBytes = decodeBase32(recoveryKeyBase32);
  const baseKey = await crypto.subtle.importKey(
    'raw',
    rawRecoveryBytes as any,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as any,
      iterations: 600000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// --- Encrypted Private Key Envelopes ---

export interface EncryptedPrivateKeyEnvelope {
  cryptoVersion: number;
  algorithm: string;
  kdf: string;
  kdfParams: {
    iterations: number;
    salt: string; // base64
  };
  nonce: string; // base64
  payload: string; // base64
}

// Encrypts user's private key using password or recovery-derived key
export async function encryptPrivateKey(
  privateKey: CryptoKey,
  derivedKey: CryptoKey,
  salt: Uint8Array
): Promise<EncryptedPrivateKeyEnvelope> {
  const jwk = await crypto.subtle.exportKey('jwk', privateKey);
  const enc = new TextEncoder();
  const rawJwkBytes = enc.encode(jsonStableStringify(jwk));

  const nonce = crypto.getRandomValues(new Uint8Array(12)); // 96-bit random IV
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce,
    },
    derivedKey,
    rawJwkBytes
  );

  return {
    cryptoVersion: 1,
    algorithm: 'AES-GCM-256',
    kdf: 'PBKDF2-HMAC-SHA256',
    kdfParams: {
      iterations: 600000,
      salt: arrayBufferToBase64(salt.buffer),
    },
    nonce: arrayBufferToBase64(nonce.buffer),
    payload: arrayBufferToBase64(ciphertext),
  };
}

// Decrypts user's private key
export async function decryptPrivateKey(
  envelope: EncryptedPrivateKeyEnvelope,
  derivedKey: CryptoKey
): Promise<CryptoKey> {
  const nonce = new Uint8Array(base64ToArrayBuffer(envelope.nonce));
  const ciphertext = base64ToArrayBuffer(envelope.payload);

  const decryptedBytes = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: nonce,
    },
    derivedKey,
    ciphertext
  );

  const dec = new TextDecoder();
  const jwk = JSON.parse(dec.decode(decryptedBytes));

  return crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['decrypt', 'unwrapKey']
  );
}

// --- Vault Keys & Wrapping ---

// Generate a random 256-bit symmetric vault key
export async function generateVaultKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true, // Must be extractable so we can wrap it
    ['encrypt', 'decrypt']
  );
}

// Wrap vault symmetric key with recipient's public key (RSA-OAEP-3072 / SHA-256)
export async function wrapVaultKey(vaultKey: CryptoKey, recipientPublicKey: CryptoKey): Promise<string> {
  const wrapped = await crypto.subtle.wrapKey(
    'raw',
    vaultKey,
    recipientPublicKey,
    {
      name: 'RSA-OAEP',
    }
  );
  return arrayBufferToBase64(wrapped);
}

// Unwrap vault key using owner's private key
export async function unwrapVaultKey(wrappedVaultKeyBase64: string, privateKey: CryptoKey): Promise<CryptoKey> {
  const wrapped = base64ToArrayBuffer(wrappedVaultKeyBase64);
  return crypto.subtle.unwrapKey(
    'raw',
    wrapped,
    privateKey,
    { name: 'RSA-OAEP' },
    { name: 'AES-GCM', length: 256 },
    true, // Vault key must be extractable so it can be re-wrapped for sharing
    ['encrypt', 'decrypt']
  );
}

// --- Record Encryption & Envelopes ---

export interface EncryptedRecordEnvelope {
  cryptoVersion: number;
  algorithm: string;
  nonce: string; // base64
  payload: string; // base64
  schemaVersion: number;
}

// Encrypt payload JSON using vault symmetric key
export async function encryptRecordPayload(
  payload: any,
  vaultKey: CryptoKey,
  schemaVersion = 1
): Promise<EncryptedRecordEnvelope> {
  const enc = new TextEncoder();
  const plaintextBytes = enc.encode(jsonStableStringify(payload));

  const nonce = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce,
    },
    vaultKey,
    plaintextBytes
  );

  return {
    cryptoVersion: 1,
    algorithm: 'AES-GCM-256',
    nonce: arrayBufferToBase64(nonce.buffer),
    payload: arrayBufferToBase64(ciphertext),
    schemaVersion: schemaVersion,
  };
}

// Decrypt payload JSON using vault symmetric key
export async function decryptRecordPayload(
  envelope: EncryptedRecordEnvelope,
  vaultKey: CryptoKey
): Promise<any> {
  const nonce = new Uint8Array(base64ToArrayBuffer(envelope.nonce));
  const ciphertext = base64ToArrayBuffer(envelope.payload);

  const decryptedBytes = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: nonce,
    },
    vaultKey,
    ciphertext
  );

  const dec = new TextDecoder();
  return JSON.parse(dec.decode(decryptedBytes));
}

// --- Helper Functions ---

// Stable stringification to guarantee bytes consistency
function jsonStableStringify(obj: any): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

// Generates exactly 32 cryptographically secure random bytes
export function generateRandomRecoveryBytes(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}
