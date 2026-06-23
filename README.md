# 🐨 KoalaFinance

> [!IMPORTANT]
> **Project Status: Early Work-in-Progress (WIP)**
> KoalaFinance is currently an early encrypted-vault foundation, not yet a complete personal finance product. It is not ready for general production usage.

KoalaFinance is a self-hosted, privacy-first, client-side end-to-end encrypted personal finance application. It is designed to allow secure manual financial tracking and budgeting without bank APIs, external integrations, telemetry, or SaaS dependencies.

---

## 1. Implemented Features (Phase 5)

Currently, the core security, database, and cryptographic foundations are fully implemented and verified:

* **Go Backend**: A lightweight Go server handling authentication, session mapping, CSRF protection, and REST endpoints.
* **Svelte/Vite Frontend**: A modern single-page application built with Svelte, Vite, and TypeScript.
* **SQLite Storage**: Database configuration running in **WAL mode**, enforcing SQLite foreign keys, with automatic embedded migration runner on startup.
* **Client-Side Cryptography Foundation**:
  - **KDF**: PBKDF2-HMAC-SHA256 with 600,000 iterations for password wrapping keys.
  - **Asymmetric Encryption**: RSA-OAEP-3072 with SHA-256 for vault key wrapping and membership sharing.
  - **Symmetric Encryption**: AES-GCM-256 with a unique random 96-bit nonce/IV generated per write operation.
  - **Recovery Keys**: 256-bit cryptographically secure secret, encoded as a 52-character RFC4648 Base32 string, split into 13 groups of 4 separated by hyphens (e.g. `XXXX-XXXX-...`).
* **Argon2id Authentication**: Secure server-side password verification.
* **Secure Sessions & CSRF**: HttpOnly secure cookies + session-bound CSRF token validation.
* **Admin Bootstrap**: Automatic site admin creation upon first launch via environment variables.
* **Registration Toggle**: Ability for site administrators to enable or disable public signups.
* **Bootstrap-Admin Crypto Setup**: Wizard flow prompting bootsrapped server-side admin users to generate key pairs, write down a recovery key, and submit wrapped keys to backend upon first login.
* **Recovery Key Confirmation**: Normalization-insensitive input matching (ignoring spaces and hyphens) forcing users to prove they have saved their recovery key before enabling encryption.
* **In-Memory Keys Lock Overlay**: Automatic password unlock prompt blocking application views if keys are cleared from browser memory (e.g. on page refresh). All keys reside strictly in-memory and are never written to `localStorage` or `sessionStorage`.
* **Vault Selector & Simple Encrypted Records**: Allows selecting vaults, creating new vaults, writing raw JSON records, and executing in-memory AES-GCM encryption/decryption roundtrips.
* **Admin Dashboard**: Technical stats (user count, vault count, record count) and registration settings.
* **Developer Verification Panel**: Dedicated debug diagnostics panel showing key parameters and crypto logs.

---

## 2. What Is NOT Implemented Yet (Phase 6+)

The following features are out of scope for the current foundation and will be implemented in future releases:

- **Full Accounts / Categories / Transactions UI** (only raw JSON record verification exists now)
- **Recurring Costs & Subscription Tracker**
- **Envelope Budgeting UI**
- **Split Transaction Editor**
- **Financial Reports & Charts**
- **Backup / Export / Import utilities**
- **Password Reset UX**
- **Docker Packaging**
- **Production Hardening** beyond the foundational Web Crypto boundaries

---

## 3. Honest Threat Model

KoalaFinance enforces a security model with explicit, honest bounds:

* **What it protects against**:
  - **Database Compromise**: If the backend database file (`.db`, `-wal`, `-shm`) is stolen or inspected, the attacker cannot read any financial amounts, account names, categories, or transaction notes. All records are stored as AES-GCM ciphertexts.
  - **Honest-but-Curious Administrators**: Site administrators cannot decrypt your vaults or view your financial transactions.
* **What it does NOT protect against**:
  - **Malicious Server-Delivered JavaScript**: Since the application is self-hosted and serves JavaScript from the backend, a compromised backend server could deliver modified code that leaks decrypted keys or plaintext input.
  - **Client Compromise / XSS / Spyware**: If your browser has a malicious extension, or your local machine is compromised with spyware, attackers can read memory keys or capture keys during derivation.
  - **Public-Key Substitution**: In this early version, there is no key-pinning or signature registry for user public keys during sharing. An admin could theoretically replace an invited user's public key during invitations. This will be addressed in future hardening.

> [!WARNING]
> **Permanent Data Loss Warning**
> KoalaFinance uses zero-knowledge cryptography. Losing both your password and your recovery key makes your encrypted financial records permanently unrecoverable. The site administrator cannot decrypt or restore your data.

---

## 4. How to Run Locally

### 4.1 Prerequisites
- **Go**: 1.20+ installed.
- **Node.js & npm**: Node 18+ installed.

### 4.2 Configuration Env Vars
Copy `.env.example` to `.env` or set these in your shell environment:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `KOALAFINANCE_PORT` | Port the Go web server binds to. | `8080` |
| `KOALAFINANCE_DATABASE_PATH` | Path to the SQLite DB file. | `/data/koalafinance.db` |
| `KOALAFINANCE_ADMIN_USERNAME` | Admin email/username on boot. | *None (Required)* |
| `KOALAFINANCE_ADMIN_PASSWORD` | Admin password on boot. | *None (Required)* |

### 4.3 Running the Application
1. **Set up local variables**:
   ```bash
   export KOALAFINANCE_PORT="8080"
   export KOALAFINANCE_DATABASE_PATH="./koalafinance.db"
   export KOALAFINANCE_ADMIN_USERNAME="admin@koalafinance.local"
   export KOALAFINANCE_ADMIN_PASSWORD="supersecretpassword123"
   ```
2. **Build and Run Go Backend**:
   ```bash
   cd backend
   go run ./cmd/koalafinance/main.go
   ```
3. **Run Frontend (Dev Mode)**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
4. **Compile Frontend for Production**:
   ```bash
   cd frontend
   npm install
   npm run build
   ```
   *Note: When running the production build, the Go backend will serve Svelte assets directly from the `frontend/dist` directory.*

---

## 5. Running Tests

### 5.1 Backend Tests
Runs argon2id password tests, sessions middleware, CSRF protections, vault access control, and database plaintext leakage validation.
```bash
cd backend
go test -v ./...
```

### 5.2 Frontend Tests
Runs Web Crypto, PBKDF2 derivations, private key wrapping/unwrapping, and AES-GCM record roundtrips.
```bash
cd frontend
npm test
```

### 5.3 Automated Smoke Test
Runs the server locally, performs health/version checks, static file serves, and checks that invalid API routes correctly return JSON 404s.
```bash
cd backend
go run ./cmd/smoketest/main.go
```
