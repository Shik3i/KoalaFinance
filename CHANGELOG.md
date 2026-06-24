# Changelog

All notable changes to KoalaFinance will be documented in this file.

## [0.5.0] - 2026-06-24

### Added
- **Client-Side Financial Dashboard & Reports (Phase 6E)**:
  - Monthly overview metrics summarizing Actual Income, Actual Expenses, Net Savings, and Savings Rate.
  - Interactive top spending categories list with visual CSS horizontal progress bars using category colors.
  - Envelope budget health panel aggregating total planned, spent, remaining limits, and overspent categories count.
  - Monthly commitments summary displaying estimated recurring inflow vs outflow.
  - Optimization section calculating potential monthly/yearly savings from recurring items marked as cancel candidates, with candidate listings.
  - Localized month picker to switch reports data instantly in-memory.
  - Zero-knowledge data isolation: all reports and charts are computed in browser from decrypted in-memory store states; no data is ever transmitted to the server.
  - Integrated Svelte navigation button at the top of the sidebar with vault unlock redirect triggers.
  - Expanded unit test coverage in `finance.test.ts` verifying calculation safety boundaries, zero-income saving rates, transfer/archived exclusions, and security static audits.

## [0.4.0] - 2026-06-24

### Added
- **Encrypted Envelope Budgeting (Phase 6D)**:
  - Monthly budget envelopes view supporting allocation limits and optional notes.
  - Planned vs. Actual calculations mapping transaction splits by category (ignores transfers/income, non-archived only).
  - Unallocated estimate calculation: `estimated monthly income - total planned envelopes` (labeled clearly as estimate).
  - Previous-month-only rollover preview: computed surplus carried over from the prior month if rollover was enabled, without mutating planned database amounts or creating extra records.
  - Safe category lookups showing "Archived Category" or "Missing Category" instead of crashing if a budget category is archived or missing.
  - Dynamic month navigation selector for current/selected budget envelope ledger views.
  - Client-side duplicate check preventing multiple active budget envelopes for the same category and month.
  - Automated tests validating budget structure, duplicate checking, spending filters, and rollover preview calculations.

## [0.3.0] - 2026-06-23

### Added
- **Encrypted Transactions UI & Splits Editor (Phase 6C)**:
  - Encrypted transactions UI with forms for Expense, Income, and Transfer types.
  - Interactive Split transactions editor for income/expenses validating that split sum equals total, category is selected, and amounts are positive.
  - Transfer transaction validator enforcing empty splits, positive transfer amounts, and distinct source/destination accounts.
  - Dynamic transaction ledger view with active filters by Month (derived), Account, Category, Type, and Show Archived toggle.
  - Real-time in-memory derived balance calculations for Accounts with "calculated" balance mode.
  - Metadata preservation on transaction CRUD, using archive-over-delete semantics (`archived: true` updates).
  - Automated tests for validator transfer rules, store CRUD, month/account/category filtering, and derived balance calculations.

## [0.2.0] - 2026-06-23

### Added
- **Accounts, Categories, and Recurring Items Management (Phase 6B)**:
  - Accounts management view with signed opening/current balance support.
  - Categories view grouped by kind with client-side active duplicate checking.
  - Recurring items management ledger with pause toggles, necessity grades, and optional account references.
  - Subscriptions & Fixed Costs derived view calculating monthly/yearly equivalents and cancel candidate metrics.
- **In-Memory Svelte Store & Metadata Wrapping**:
  - Encapsulated decrypted records in a `LoadedFinanceRecord<T>` wrapper to preserve backend record IDs and revisions for updates.
  - Automated PUT vs. POST routing selection based on metadata presence.
  - Tolerated partial decryption failures by skipping invalid payloads and showing a user-visible warning banner with a reload button.
- **Money Parser & Formatter Helpers**:
  - Implemented strict comma/dot parser mapping Euros to integer minor units (cents) with safe bounds checks.
- **Build Safety & Privacy Hardening**:
  - Prevented plaintext leakage in console warnings (only technical fields logged).
  - Enforced archive-over-delete semantics across all finance views (no hard deletes).
  - Random UUID category ID seeding to prevent name-derived metadata leakage to the server.
  - Added automated static analysis tests ensuring no `{@html}` tags or local storage of keys/vault state exist in Svelte/TS files.

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
