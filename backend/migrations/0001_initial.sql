-- Initial SQLite database schema migration

CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
);

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'admin')),
    status TEXT NOT NULL CHECK(status IN ('active', 'disabled', 'reset_required')),
    public_key TEXT, -- Plaintext base64 RSA SPKI format
    encrypted_private_key TEXT, -- JSON envelope containing password-encrypted private key
    encrypted_private_key_recovery TEXT, -- JSON envelope containing recovery-encrypted private key
    kdf_params_json TEXT, -- salt & iterations for password-derived KDF
    recovery_kdf_params_json TEXT, -- salt & iterations for recovery-derived KDF
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT
);

-- Sessions Table
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    csrf_secret TEXT NOT NULL -- Session-bound secret for CSRF token generation
);

-- App Settings Table (e.g. registration_enabled)
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Vaults Table
CREATE TABLE IF NOT EXISTS vaults (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

-- Vault Members Table (vault access keys wrapped per user public key)
CREATE TABLE IF NOT EXISTS vault_members (
    vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('owner', 'read', 'write')),
    encrypted_vault_key TEXT NOT NULL, -- RSA-OAEP-3072 encrypted vault symmetric key
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (vault_id, user_id)
);

-- Encrypted Finance Records Table
CREATE TABLE IF NOT EXISTS encrypted_records (
    id TEXT PRIMARY KEY,
    vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    record_type TEXT NOT NULL CHECK(record_type IN ('account', 'category', 'recurring_item', 'transaction', 'budget', 'settings')),
    schema_version INTEGER NOT NULL,
    crypto_version INTEGER NOT NULL,
    encrypted_payload TEXT NOT NULL, -- AES-GCM encrypted JSON payload
    nonce TEXT NOT NULL, -- 96-bit AES-GCM IV base64
    created_by TEXT NOT NULL REFERENCES users(id),
    updated_by TEXT NOT NULL REFERENCES users(id),
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

-- Security Events Table
CREATE TABLE IF NOT EXISTS security_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    details TEXT,
    ip_address TEXT,
    created_at TEXT NOT NULL
);
