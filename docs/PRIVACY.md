# Privacy Policy & Metadata Visibility

This document describes the privacy guarantees and technical boundaries of KoalaFinance.

## 1. Zero Tracking Philosophy

- **No Telemetry**: KoalaFinance has no telemetry, tracking code, or home-calling mechanisms.
- **No Analytics**: No Google Analytics, Mixpanel, or custom pageview trackers are included.
- **No Third-Party Dependencies**: No external fonts, icon packs, CDNs, or scripts. The application runs fully locally and self-hosted.

---

## 2. Server Data Visibility

The server acts as an encrypted storage engine. The table below details what the server stores and its visibility profile.

| Data Item | Server Visibility Profile | Reason |
| :--- | :--- | :--- |
| **Email/Username** | Plaintext | Required for authentication and vault sharing invitations. |
| **Password** | Argon2id Hash | Required for user authentication. |
| **Recovery Key** | **Zero Visibility** | Never sent to or stored on the server. |
| **User Keypair (Public)** | Plaintext | Needed by other members to wrap vault keys. |
| **User Keypair (Private)** | Encrypted Ciphertext | Stored on server, decrypted only in user memory. |
| **Vault Metadata** | Plaintext ID, Encrypted Name | Vault ID is technical; names are client-side encrypted. |
| **Vault Membership** | Plaintext User-Vault mapping | Required for access control and authorization. |
| **Financial Records** | **Encrypted Ciphertext** | Amounts, category names, transaction labels, payees, notes, subscription intervals are encrypted client-side. |
| **Record Type** | Plaintext (`account`, `transaction`, etc.) | Technical metadata used for synchronization and indexing. |
| **Timestamps** | Plaintext | Required for record synchronization and audits. |

---

## 3. Site Admin Access Limits

The site administrator role manages technical health and user registration. To preserve user privacy, the design enforces the following constraints:

- **No Implicit Vault Access**: An administrator cannot query or decrypt vault keys or records. They have no default membership to user vaults.
- **No Financial Aggregates**: The admin dashboard cannot query totals such as "average user balance," "top categories," or "total platform transaction count."
- **Visible Statistics**: The admin can only view:
  - Total number of registered users.
  - Total number of vaults.
  - Count of total encrypted records (without knowing their contents).
  - Security audit events (e.g. failed login attempts, password changes).
  - Global application settings (e.g. public registration toggle).
