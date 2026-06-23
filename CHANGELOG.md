# Changelog

All notable changes to KoalaFinance will be documented in this file.

## [0.1.0] - 2026-06-23

### Added
- **Core Go Backend**: Structured HTTP router using chi, Argon2id password hashing, and session-bound CSRF validation.
- **SQLite Database Layer**: Integrated BusyTimeout, WAL mode, foreign keys, and embedded database migration runner.
- **Client-Side Cryptography Foundation**: Web Crypto API wrapper implementing PBKDF2 iterations, RSA-OAEP-3072 key wrapping, and AES-GCM-256 record encryption/decryption with random nonces.
- **52-Character Base32 Recovery Keys**: Grouped for user readability and validated using normalisation-insensitive input matching.
- **Bootstrap Admin Setup Flow**: Triggers key setup and persistency on first login for unkeyed administrator accounts.
- **In-Memory Unlock Overlay**: Blocks views and unlocks keys via password when refreshed.
- **Admin Dashboard**: Anonymous technical statistics (user count, vault count, record count) and registration settings switch.
- **Developer Diagnostics Panel**: Client key status and encrypted record roundtrip verification console.
- **Automated Test Coverage**: Comprehensive suite for database plaintext checks, CSRF, auth sessions, and Web Crypto tests.
