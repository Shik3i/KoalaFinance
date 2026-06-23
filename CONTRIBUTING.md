# Contributing to KoalaFinance

Thank you for your interest in contributing to KoalaFinance! We welcome contributions that help improve this self-hosted personal finance tool.

## Code of Conduct

Please be respectful and constructive in all communication and interactions with members of the project.

## How to Contribute

### 1. Reporting Bugs
- Search existing issues to verify that the bug has not been reported yet.
- Open a new issue with a clear description, reproduction steps, expected behavior, and actual behavior.

### 2. Suggesting Features
- Open a feature request issue describing the feature, why it is useful, and how it should work.

### 3. Submitting Pull Requests (PRs)
- Fork the repository and create your branch from `main`.
- Write clean code following the project structure.
- **Run all tests** before submitting:
  - Backend: `cd backend && go test -v ./...`
  - Frontend: `cd frontend && npm test`
- Submit a PR with a description of the changes.

## Development Guidelines

### Zero-Knowledge Cryptography
KoalaFinance enforces strict end-to-end client-side encryption. 
- **Decrypted private keys, vault keys, or plaintext financial inputs must never be logged to the console or stored in localStorage/sessionStorage.** Keep all key materials strictly in-memory.
- Server-side code must never receive passwords, recovery keys, or decrypted records.
- Avoid external libraries for cryptographic functions unless verified. Always stick to the standard Web Crypto API.
