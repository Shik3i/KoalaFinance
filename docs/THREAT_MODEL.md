# Threat Model

This document outlines the security boundaries and threat model for KoalaFinance.

## 1. Security Overview & Model Honesty

KoalaFinance uses client-side encryption so the server stores finance data only as ciphertext during normal operation. This protects against database inspection and honest-but-curious server administration, but it cannot protect against malicious frontend code served by the server or XSS in the client.

---

## 2. What KoalaFinance Protects Against

- **Database Theft**: If the raw SQLite database (`koalafinance.db`) is stolen or leaked, all financial accounts, categories, transactions, budgets, subscriptions, and amounts remain encrypted. Attackers cannot read any financial entries.
- **Honest-but-Curious Server Admins**: A server administrator who has root or system-level access to the hosting server can inspect files, but they cannot read financial data because they do not have the user's password or the decrypted private key (which is kept strictly in-memory in the user's browser).
- **Leaked Backups**: Unencrypted database backups will only reveal metadata (timestamps, storage sizes, usernames) but no financial data.
- **Unauthorized Vault Access**: Users cannot access vaults they are not members of. Vault keys are encrypted specifically for the public keys of authorized members.
- **Read-Only Vault Member Manipulation**: If a member has a `read` role, the server enforces that they cannot insert or modify records. Even if the user alters client-side code to bypass UI blocks, the backend API rejects their mutations.
- **Disabled Users**: If an administrator disables a user, their active sessions are invalidated immediately, and they are blocked from authentication and API usage.

---

## 3. What KoalaFinance Cannot Protect Against (Out of Scope / Limitations)

- **Malicious Server Operator / Compromised Server Files**: A malicious hosting provider or server administrator could modify the frontend Svelte/JavaScript files served by the app (e.g. injecting a script that grabs the password or recovery key at login time).
- **Cross-Site Scripting (XSS)**: If an attacker manages to inject script execution inside the client-side browser context (origin), they can access the in-memory keys and decrypt/exfiltrate financial data. Prevention of XSS is paramount.
- **Compromised Client / Browser Malware**: A user with a keylogger, malicious browser extension, or malware running on their machine is vulnerable to credential/key theft.
- **Public Key Substitution Attack**: When sharing a vault, the client queries the server for the recipient's public key. A malicious server could return a public key controlled by the attacker, allowing them to decrypt the vault key upon sharing. (Mitigation: Out-of-band fingerprint validation, which is a post-MVP consideration).
- **Decrypted JSON Exports**: If a user exports their vault as decrypted JSON, they are responsible for securing the resulting plaintext file.
- **Social Engineering / User Behavior**: An authorized user taking screenshots, copying numbers, or sharing their credentials cannot be stopped by cryptography.
