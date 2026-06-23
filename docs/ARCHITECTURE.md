# Architecture Documentation

This document describes the technical architecture of KoalaFinance.

## High-Level Overview

KoalaFinance uses a client-side encrypted model, where the server is an "honest-but-curious" metadata and storage layer. The server has no access to raw financial keys or plaintext financial payloads.

```
┌────────────────────────────────────────────────────────┐
│                        Browser                         │
│                                                        │
│   [ Plaintext Finance UI ]   ◄───►   [ Memory Store ]  │
│                                            │           │
│                                            ▼           │
│                                   [ Crypto Engine ]    │
│                                            ▲           │
└────────────────────────────────────────────┼───────────┘
                                             │ JSON (Ciphertext)
                                             ▼
┌────────────────────────────────────────────────────────┐
│                     Go Backend                         │
│                                                        │
│   [ HTTP Router (Chi) ]  ◄───►  [ Auth & Session ]     │
│             │                                          │
│             ▼                                          │
│     [ SQLite (Modernc) ]                               │
└────────────────────────────────────────────────────────┘
```

---

## 1. Technological Stack

- **Backend**: Go 1.21+ utilizing `net/http` and `github.com/go-chi/chi/v5` router.
- **Database**: SQLite via `modernc.org/sqlite` (cgo-free driver).
- **Frontend**: Svelte + Vite + TypeScript.
- **Production Asset serving**: The Go backend embeds the built Svelte frontend and serves it over HTTP.
- **Data volume**: `/data` inside the Docker container.
- **Database path default**: `/data/koalafinance.db`.

---

## 2. Client-Side Cryptographic Scheme

The core security of KoalaFinance relies on browser-native Web Crypto APIs.

### 2.1 Keys & Wrapping Flow

1. **User Keypair**:
   - Generated as an asymmetric `RSA-OAEP-3072` key pair using SHA-256.
   - The Public Key is stored in plaintext on the server.
   - The Private Key is encrypted in the browser and stored on the server as `encrypted_private_key`.

2. **Master Key Derivation (KDF)**:
   - Derived from the user's password using **PBKDF2-HMAC-SHA256** with **600,000 iterations**.
   - A unique 16-byte random salt is generated upon registration.
   - The derived 256-bit AES key is used to encrypt the user's private RSA key using **AES-GCM-256** with a random 96-bit nonce/IV.

3. **Recovery Key**:
   - Generated in the browser as 32 cryptographically secure random bytes.
   - Encoded as RFC4648 Base32 without padding (52 characters). Grouped in blocks of 4 separated by hyphens (13 groups).
   - Serves as the backup key to recover the private key.
   - The private key is encrypted separately with a key derived from the recovery key using PBKDF2-HMAC-SHA256 (600,000 iterations) with its own salt. This is stored as `encrypted_private_key_recovery`.
   - The server never receives or stores the recovery key.

4. **Vault Keys**:
   - Each Vault contains a random 256-bit symmetric vault key (AES-GCM).
   - This vault key is wrapped/encrypted separately for each vault member using the member's public `RSA-OAEP-3072` key.
   - The wrapped vault key is stored as `encrypted_vault_key` inside `vault_members`.

5. **Record Encryption**:
   - Each financial record (accounts, categories, transactions, budgets) is serialized to JSON.
   - The JSON string is encrypted with the vault key using **AES-GCM-256** with a fresh 96-bit random nonce/IV.
   - An authenticated envelope contains the crypto version, algorithm, nonce, and ciphertext payload.

---

## 3. Envelope Structures

### 3.1 Encrypted Private Key Envelope
```json
{
  "cryptoVersion": 1,
  "algorithm": "AES-GCM-256",
  "kdf": "PBKDF2-HMAC-SHA256",
  "kdfParams": {
    "iterations": 600000,
    "salt": "base64-encoded-salt"
  },
  "nonce": "base64-encoded-96bit-nonce",
  "payload": "base64-encoded-wrapped-private-key-jwk"
}
```

### 3.2 Encrypted Record Envelope
```json
{
  "cryptoVersion": 1,
  "algorithm": "AES-GCM-256",
  "nonce": "base64-encoded-96bit-nonce",
  "payload": "base64-encoded-ciphertext-json",
  "schemaVersion": 1
}
```

---

## 4. Metadata Policy

To prevent leakage, the server must only track general metadata.
- **Allowed `record_type` values**: `account`, `category`, `recurring_item`, `transaction`, `budget`, `settings`.
- **Prohibited values**: Specific names or tags reflecting specific financial activities (e.g., `netflix_subscription`, `salary_income`).
- **Record IDs**: All financial record IDs (including category, account, transaction, and budget records) are randomly generated client-side (UUIDs) and never derived from financial names, user inputs, or category identifiers.
- **Default Category Seeding Idempotency**: Seeding is idempotent and checked client-side. The client decrypts existing category records to verify whether defaults are already present before sending any new category creation requests, preventing duplicate seeding without leaking category names or establishing deterministic ID generation patterns.

---

## 5. Security & Session Management

- **Sessions**: Stored in SQLite. Secure, HttpOnly, Lax SameSite cookies containing a high-entropy session token. Hashed session tokens are stored on the server to prevent token database leakage exploitation.
- **CSRF**: Double-submit token tied to the active session server-side. Checked on all state-changing API endpoints.
- **Log Policy**: Financial amounts, names, category values, nonces, password-derived keys, and recovery keys must **never** be printed in Go backend logs.
