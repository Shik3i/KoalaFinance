# Security Policy & Implementation

This document describes the security configurations and design requirements for KoalaFinance.

## 1. Security Headers

The Go backend must set the following headers on all HTTP responses:

- **Content-Security-Policy (CSP)**:
  ```http
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; object-src 'none'; base-uri 'self';
  ```
  - **No inline scripts** are permitted.
  - **No external CDNs**, fonts, analytics, or third-party styles are permitted.
- **X-Content-Type-Options**: `nosniff` (prevents MIME type sniffing).
- **Referrer-Policy**: `no-referrer`.
- **X-Frame-Options**: `DENY` (equivalent to frame-ancestors 'none' for older browsers).
- **Permissions-Policy**: Disable unused hardware integrations (geolocation, camera, microphone, etc.).

---

## 2. Session Cookies

- **Token Type**: 32-byte cryptographically secure random token, hashed using SHA-256 before storage on the server.
- **HttpOnly**: Yes (prevents client-side scripts from reading the cookie).
- **Secure**: Yes, enabled in production.
- **SameSite**: `Lax` to allow standard navigations while preventing cross-site leakages.
- **Max-Age**: Standard expiration (e.g. 7 days).

---

## 3. Session-Bound CSRF Protection

- Every session is associated with a CSRF token secret generated upon session creation.
- Mutation requests (POST, PUT, PATCH, DELETE) must supply the token in a header (e.g. `X-CSRF-Token`).
- The Go server validates the header token matches the session-bound secret.
- Failing validation results in a `403 Forbidden` response.

---

## 4. XSS Mitigation

XSS is a critical threat since it can expose decrypted in-memory keys.
- **No Svelte `{@html}`** rendering is used for user content.
- **No Markdown parsers** are allowed in the MVP.
- All notes and text inputs are rendered as escaped plain text by Svelte.
- URL links (such as website URLs, if any) must be validated to ensure they use only safe protocols (`http:`, `https:`).

---

## 5. Log Security

Logs must never contain:
- Password-derived material, recovery keys, or decrypted keys.
- Plaintext financial fields (amounts, names, notes).
- Raw SQL parameter outputs containing encrypted payloads or sensitive nonces if logging query values.
- Hashed or plaintext session tokens.
- CSRF tokens.

Logs may safely output request paths, HTTP response statuses, user IDs, vault IDs, and technical database query timings.
