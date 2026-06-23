<script lang="ts">
  import { onMount } from 'svelte';
  import {
    generateUserKeyPair,
    deriveKeyFromPassword,
    deriveKeyFromRecoveryKey,
    encryptPrivateKey,
    decryptPrivateKey,
    generateVaultKey,
    wrapVaultKey,
    unwrapVaultKey,
    encryptRecordPayload,
    decryptRecordPayload,
    encodeBase32,
    generateRandomRecoveryBytes,
    arrayBufferToBase64,
    base64ToArrayBuffer
  } from './lib/crypto';

  import Sidebar from './lib/components/Sidebar.svelte';
  import RecoveryConfirm from './lib/components/RecoveryConfirm.svelte';
  import AdminPanel from './lib/components/AdminPanel.svelte';
  import DebugPanel from './lib/components/DebugPanel.svelte';
  import { toEncryptedRecordInput, fromEncryptedRecord } from './lib/finance/records';
  import { generateDefaultCategories } from './lib/finance/defaults';
  import {
    setVault,
    clearVault,
    warning as storeWarning,
    refreshRecords,
    totalRecordsLoaded,
    successfullyDecryptedCount,
    skippedRecordsCount
  } from './lib/finance/store';
  import AccountsView from './lib/components/finance/AccountsView.svelte';
  import CategoriesView from './lib/components/finance/CategoriesView.svelte';
  import RecurringItemsView from './lib/components/finance/RecurringItemsView.svelte';
  import SubscriptionsView from './lib/components/finance/SubscriptionsView.svelte';

  // --- State Variables ---
  let isLoginView = true;
  let registrationEnabled = false;

  // Registration Form
  let regUsername = '';
  let regPassword = '';
  let regSuccessMessage = '';
  let regErrorMessage = '';
  let regRecoveryKey = '';

  // Registration Recovery Key Confirmation Wizard
  let showRegisterRecoveryConfirm = false;
  let tempRegKeyPair: { publicKey: CryptoKey; privateKey: CryptoKey } | null = null;
  let tempRegRecoveryKey = '';

  // Login Form
  let loginUsername = '';
  let loginPassword = '';
  let loginSuccessMessage = '';
  let loginErrorMessage = '';

  // Current session (kept in-memory)
  type User = {
    id: string;
    username: string;
    role: string;
    public_key?: string;
    encrypted_private_key?: string;
    kdf_params_json?: string;
  };

  let currentUser: User | null = null;
  let csrfToken = '';
  let decryptedPrivateKey: CryptoKey | null = null;

  // Crypto setup required flow state
  let showCryptoSetupRequired = false;
  let cryptoSetupPassword = '';
  let cryptoSetupErrorMessage = '';
  let cryptoSetupSuccessMessage = '';
  let cryptoSetupStep = 1; // 1 = prompt password, 2 = recovery key confirm
  let cryptoSetupRecoveryKey = '';
  let cryptoSetupKeyPair: { publicKey: CryptoKey; privateKey: CryptoKey } | null = null;

  // Re-unlock flow state (Page refreshed/keys cleared)
  let unlockPassword = '';
  let unlockErrorMessage = '';

  // Active Tab
  let activeTab = 'vaults';

  // Vault state
  let vaultsList: any[] = [];
  let selectedVaultId = '';
  let activeVaultKey: CryptoKey | null = null;
  let vaultCreationMessage = '';

  // Records state (Simple playground inside Vault tab)
  let plainRecordText = '{"name": "Rent", "amount": 1200.00, "category": "Housing"}';
  let recordStatus = '';
  let decryptedRecords: any[] = [];

  // --- Lifecycle Hooks ---
  onMount(async () => {
    await fetchRegistrationStatus();
    await fetchMe();
  });

  // --- Fetch Methods ---
  async function fetchRegistrationStatus() {
    try {
      const res = await fetch('/api/auth/registration-status');
      if (res.ok) {
        const data = await res.json();
        registrationEnabled = data.registration_enabled;
      }
    } catch (err) {
      console.error('Failed to load registration status', err);
    }
  }

  async function fetchMe() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        currentUser = data.user;
        csrfToken = data.csrf_token;
        
        // If logged in, check if crypto setup is needed
        if (currentUser && (!currentUser.public_key || !currentUser.encrypted_private_key)) {
          showCryptoSetupRequired = true;
        } else {
          showCryptoSetupRequired = false;
          // If keys unlocked in memory, reload vaults
          if (decryptedPrivateKey) {
            await refreshVaults();
          }
        }
      } else {
        currentUser = null;
        csrfToken = '';
      }
    } catch (err) {
      console.log('No active session.');
      currentUser = null;
      csrfToken = '';
    }
  }

  // --- Action Handlers ---

  // 1. Registration Flow Steps
  async function handleStartRegister() {
    regSuccessMessage = '';
    regErrorMessage = '';
    regRecoveryKey = '';

    if (!regUsername) {
      regErrorMessage = 'Username is required';
      return;
    }
    if (regPassword.length < 8) {
      regErrorMessage = 'Password must be at least 8 characters';
      return;
    }

    try {
      regSuccessMessage = 'Generating RSA-OAEP-3072 key pair (this may take a second)...';
      
      // Generate keys
      tempRegKeyPair = await generateUserKeyPair();
      
      // Generate recovery key
      const recoveryBytes = generateRandomRecoveryBytes();
      tempRegRecoveryKey = encodeBase32(recoveryBytes);
      regRecoveryKey = tempRegRecoveryKey;

      regSuccessMessage = '';
      showRegisterRecoveryConfirm = true;
    } catch (err: any) {
      regSuccessMessage = '';
      regErrorMessage = 'Key generation failed: ' + err.message;
    }
  }

  async function handleConfirmRegister() {
    regErrorMessage = '';
    if (!tempRegKeyPair || !tempRegRecoveryKey || !regUsername || !regPassword) {
      regErrorMessage = 'Registration state invalid. Please restart signup.';
      return;
    }

    try {
      regSuccessMessage = 'Wrapping private key and submitting...';
      const keyPair = tempRegKeyPair;
      const recoveryKeyStr = tempRegRecoveryKey;

      const pubJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
      const pubJwkStr = JSON.stringify(pubJwk);

      const passwordSalt = crypto.getRandomValues(new Uint8Array(16));
      const recoverySalt = crypto.getRandomValues(new Uint8Array(16));

      const passwordAesKey = await deriveKeyFromPassword(regPassword, passwordSalt);
      const recoveryAesKey = await deriveKeyFromRecoveryKey(recoveryKeyStr, recoverySalt);

      const encPrivateEnvelope = await encryptPrivateKey(keyPair.privateKey, passwordAesKey, passwordSalt);
      const encRecoveryEnvelope = await encryptPrivateKey(keyPair.privateKey, recoveryAesKey, recoverySalt);

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: regUsername,
          password: regPassword,
          public_key: btoa(pubJwkStr),
          encrypted_private_key: JSON.stringify(encPrivateEnvelope),
          encrypted_private_key_recovery: JSON.stringify(encRecoveryEnvelope),
          kdf_params_json: JSON.stringify({ salt: arrayBufferToBase64(passwordSalt.buffer) }),
          recovery_kdf_params_json: JSON.stringify({ salt: arrayBufferToBase64(recoverySalt.buffer) })
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Registration failed');
      }

      regSuccessMessage = 'Registration successful! Store your recovery key safely, then log in.';
      showRegisterRecoveryConfirm = false;
      tempRegKeyPair = null;
      tempRegRecoveryKey = '';
      
      // Auto transition to login view
      isLoginView = true;
      loginUsername = regUsername;
      regUsername = '';
      regPassword = '';
    } catch (err: any) {
      regSuccessMessage = '';
      regErrorMessage = err.message;
    }
  }

  function handleCancelRegister() {
    showRegisterRecoveryConfirm = false;
    tempRegKeyPair = null;
    tempRegRecoveryKey = '';
    regErrorMessage = '';
    regSuccessMessage = '';
  }

  // 2. Crypto Setup Required Flow
  async function handleStartCryptoSetup() {
    cryptoSetupErrorMessage = '';
    cryptoSetupSuccessMessage = '';

    if (!cryptoSetupPassword) {
      cryptoSetupErrorMessage = 'Password is required to proceed.';
      return;
    }
    if (cryptoSetupPassword.length < 8) {
      cryptoSetupErrorMessage = 'Password must be at least 8 characters.';
      return;
    }

    try {
      cryptoSetupSuccessMessage = 'Generating crypto materials...';
      cryptoSetupKeyPair = await generateUserKeyPair();
      const recoveryBytes = generateRandomRecoveryBytes();
      cryptoSetupRecoveryKey = encodeBase32(recoveryBytes);
      cryptoSetupSuccessMessage = '';
      cryptoSetupStep = 2;
    } catch (err: any) {
      cryptoSetupSuccessMessage = '';
      cryptoSetupErrorMessage = 'Key generation failed: ' + err.message;
    }
  }

  async function handleConfirmCryptoSetup() {
    cryptoSetupErrorMessage = '';
    if (!cryptoSetupKeyPair || !cryptoSetupRecoveryKey || !cryptoSetupPassword) {
      cryptoSetupErrorMessage = 'Setup state invalid. Please restart.';
      return;
    }

    try {
      cryptoSetupSuccessMessage = 'Encrypting private key and uploading setup...';
      const keyPair = cryptoSetupKeyPair;
      const recoveryKeyStr = cryptoSetupRecoveryKey;

      const pubJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
      const pubJwkStr = JSON.stringify(pubJwk);

      const passwordSalt = crypto.getRandomValues(new Uint8Array(16));
      const recoverySalt = crypto.getRandomValues(new Uint8Array(16));

      const passwordAesKey = await deriveKeyFromPassword(cryptoSetupPassword, passwordSalt);
      const recoveryAesKey = await deriveKeyFromRecoveryKey(recoveryKeyStr, recoverySalt);

      const encPrivateEnvelope = await encryptPrivateKey(keyPair.privateKey, passwordAesKey, passwordSalt);
      const encRecoveryEnvelope = await encryptPrivateKey(keyPair.privateKey, recoveryAesKey, recoverySalt);

      const res = await fetch('/api/auth/recovery/rewrap-private-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({
          public_key: btoa(pubJwkStr),
          encrypted_private_key: JSON.stringify(encPrivateEnvelope),
          encrypted_private_key_recovery: JSON.stringify(encRecoveryEnvelope),
          kdf_params_json: JSON.stringify({ salt: arrayBufferToBase64(passwordSalt.buffer) }),
          recovery_kdf_params_json: JSON.stringify({ salt: arrayBufferToBase64(recoverySalt.buffer) })
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to complete cryptographic setup');
      }

      decryptedPrivateKey = keyPair.privateKey;
      cryptoSetupPassword = '';
      cryptoSetupStep = 1;
      cryptoSetupKeyPair = null;
      cryptoSetupRecoveryKey = '';
      showCryptoSetupRequired = false;

      await fetchMe();
    } catch (err: any) {
      cryptoSetupSuccessMessage = '';
      cryptoSetupErrorMessage = err.message;
    }
  }

  function handleCancelCryptoSetup() {
    cryptoSetupStep = 1;
    cryptoSetupKeyPair = null;
    cryptoSetupRecoveryKey = '';
    cryptoSetupErrorMessage = '';
    cryptoSetupSuccessMessage = '';
  }

  // 3. Login
  async function handleLogin() {
    loginSuccessMessage = '';
    loginErrorMessage = '';

    if (!loginUsername || !loginPassword) {
      loginErrorMessage = 'Username and password are required.';
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      currentUser = data.user;
      csrfToken = data.csrf_token;
      loginSuccessMessage = 'Logged in successfully.';

      // Unpack private key if they have one
      if (currentUser && currentUser.encrypted_private_key && currentUser.kdf_params_json) {
        const envelope = JSON.parse(currentUser.encrypted_private_key);
        const kdfParams = JSON.parse(currentUser.kdf_params_json);
        const saltBytes = new Uint8Array(base64ToArrayBuffer(kdfParams.salt));

        const passwordAesKey = await deriveKeyFromPassword(loginPassword, saltBytes);
        decryptedPrivateKey = await decryptPrivateKey(envelope, passwordAesKey);
        
        await refreshVaults();
      } else if (currentUser && (!currentUser.public_key || !currentUser.encrypted_private_key)) {
        showCryptoSetupRequired = true;
      }
    } catch (err: any) {
      loginErrorMessage = err.message;
    }
  }

  // 4. Logout
  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      currentUser = null;
      csrfToken = '';
      decryptedPrivateKey = null;
      activeVaultKey = null;
      vaultsList = [];
      decryptedRecords = [];
      activeTab = 'vaults';
      selectedVaultId = '';
      clearVault();
    }
  }

  // 5. In-Memory Unlock
  async function handleUnlock() {
    unlockErrorMessage = '';
    if (!currentUser || !currentUser.encrypted_private_key || !currentUser.kdf_params_json) {
      unlockErrorMessage = 'No active user session. Please log in.';
      return;
    }

    try {
      const envelope = JSON.parse(currentUser.encrypted_private_key);
      const kdfParams = JSON.parse(currentUser.kdf_params_json);
      const saltBytes = new Uint8Array(base64ToArrayBuffer(kdfParams.salt));

      const passwordAesKey = await deriveKeyFromPassword(unlockPassword, saltBytes);
      decryptedPrivateKey = await decryptPrivateKey(envelope, passwordAesKey);

      unlockPassword = '';
      await refreshVaults();
    } catch (err) {
      unlockErrorMessage = 'Invalid password - could not decrypt private key.';
    }
  }

  // 6. Vault Operations
  async function handleCreateVault() {
    vaultCreationMessage = '';
    if (!decryptedPrivateKey || !currentUser || !currentUser.public_key) {
      vaultCreationMessage = 'Unlock private key first.';
      return;
    }

    try {
      const vaultKey = await generateVaultKey();
      const pubJwkStr = atob(currentUser.public_key);
      const pubJwk = JSON.parse(pubJwkStr);
      const userPublicKey = await crypto.subtle.importKey(
        'jwk',
        pubJwk,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        true,
        ['wrapKey', 'encrypt']
      );

      const wrappedVaultKey = await wrapVaultKey(vaultKey, userPublicKey);

      const res = await fetch('/api/vaults', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({ encrypted_vault_key: wrappedVaultKey })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create vault');
      }

      vaultCreationMessage = `Vault created successfully. Seeding default categories...`;
      
      // Fetch existing records for this vault and decrypt categories client-side to prevent duplicates on retry
      const existingCategories = new Set<string>();
      try {
        const recordsRes = await fetch(`/api/vaults/${data.id}/records`);
        if (recordsRes.ok) {
          const records = await recordsRes.json();
          for (const rec of records) {
            if (rec.record_type === "category") {
              try {
                const plaintextCat = await fromEncryptedRecord(rec, vaultKey);
                if (plaintextCat && plaintextCat.kind && plaintextCat.name) {
                  const key = `${plaintextCat.kind}:${plaintextCat.name.trim().toLowerCase()}`;
                  existingCategories.add(key);
                }
              } catch (decErr) {
                console.error("Failed to decrypt category for retry deduplication", decErr);
              }
            }
          }
        }
      } catch (fetchErr) {
        console.error("Failed to fetch existing records for duplicate check", fetchErr);
      }

      const defaultCategories = generateDefaultCategories();
      let seededCount = 0;
      let seedFailed = false;

      for (const cat of defaultCategories) {
        const key = `${cat.kind}:${cat.name.trim().toLowerCase()}`;
        if (existingCategories.has(key)) {
          seededCount++; // Already seeded
          continue;
        }

        try {
          const recordInput = await toEncryptedRecordInput("category", cat, vaultKey);
          const postRes = await fetch(`/api/vaults/${data.id}/records`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify({
              id: cat.id,
              ...recordInput
            })
          });

          if (!postRes.ok) {
            const errData = await postRes.json().catch(() => ({}));
            if (postRes.status === 409) {
              seededCount++; // Conflict means already seeded, which is safe
            } else {
              throw new Error(errData.error || `HTTP ${postRes.status}`);
            }
          } else {
            seededCount++;
          }
        } catch (catErr: any) {
          console.error("Failed to seed category", cat.name, catErr);
          seedFailed = true;
        }
      }

      if (seedFailed) {
        vaultCreationMessage = `Vault created, but default categories failed to seed (${seededCount}/${defaultCategories.length} seeded). You can retry later.`;
      } else {
        vaultCreationMessage = `Vault created and default categories seeded successfully.`;
      }

      activeVaultKey = vaultKey;
      selectedVaultId = data.id;
      await setVault(data.id, vaultKey);
      await refreshVaults();
    } catch (err: any) {
      vaultCreationMessage = err.message;
    }
  }

  async function refreshVaults() {
    try {
      const res = await fetch('/api/vaults');
      if (res.ok) {
        vaultsList = await res.json();
        if (vaultsList.length > 0) {
          if (!selectedVaultId) {
            selectedVaultId = vaultsList[0].id;
            await selectVault();
          } else if (!activeVaultKey) {
            await selectVault();
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch vaults', err);
    }
  }

  async function selectVault() {
    activeVaultKey = null;
    decryptedRecords = [];
    if (!selectedVaultId) return;

    const vault = vaultsList.find(v => v.id === selectedVaultId);
    if (!vault || !decryptedPrivateKey) return;

    try {
      activeVaultKey = await unwrapVaultKey(vault.encrypted_vault_key, decryptedPrivateKey);
      await fetchAndDecryptRecords();
      await setVault(selectedVaultId, activeVaultKey);
    } catch (err) {
      console.error('Failed to unwrap vault key.', err);
    }
  }

  // 7. Record Operations
  async function saveRecord() {
    recordStatus = '';
    if (!activeVaultKey) {
      recordStatus = 'Select and unlock a vault first.';
      return;
    }

    try {
      let payload;
      try {
        payload = JSON.parse(plainRecordText);
      } catch {
        throw new Error('Record content must be valid JSON');
      }

      const envelope = await encryptRecordPayload(payload, activeVaultKey, 1);
      
      const recordId = 'rec_' + Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const res = await fetch(`/api/vaults/${selectedVaultId}/records`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({
          id: recordId,
          record_type: 'transaction',
          schema_version: envelope.schemaVersion,
          crypto_version: envelope.cryptoVersion,
          encrypted_payload: envelope.payload,
          nonce: envelope.nonce
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save record');
      }

      recordStatus = 'Record encrypted and saved successfully!';
      await fetchAndDecryptRecords();
    } catch (err: any) {
      recordStatus = err.message;
    }
  }

  async function fetchAndDecryptRecords() {
    if (!selectedVaultId || !activeVaultKey) return;

    try {
      const res = await fetch(`/api/vaults/${selectedVaultId}/records`);
      if (!res.ok) throw new Error('Failed to fetch encrypted records');

      const encRecords = await res.json();
      const list = [];
      for (const rec of encRecords) {
        try {
          const decrypted = await decryptRecordPayload(
            {
              cryptoVersion: rec.crypto_version,
              algorithm: 'AES-GCM-256',
              nonce: rec.nonce,
              payload: rec.encrypted_payload,
              schemaVersion: rec.schema_version
            },
            activeVaultKey
          );
          list.push({ id: rec.id, payload: decrypted, raw: rec });
        } catch (decErr) {
          list.push({ id: rec.id, error: 'Decryption failed', raw: rec });
        }
      }
      decryptedRecords = list;
    } catch (err) {
      console.error(err);
    }
  }

  function clearKeys() {
    decryptedPrivateKey = null;
    activeVaultKey = null;
    decryptedRecords = [];
    unlockErrorMessage = '';
    clearVault();
  }

  function changeTab(tab: string) {
    activeTab = tab;
  }
</script>

<div class="app-layout">
  {#if !currentUser}
    <!-- Auth Flow (Landing, Login, Register) -->
    <div class="auth-wrapper">
      <div class="auth-card">
        <div class="auth-header">
          <span class="auth-logo">🐨</span>
          <h1>Welcome to KoalaFinance</h1>
          <p class="auth-subtitle">Self-hosted, client-side end-to-end encrypted personal finance</p>
        </div>

        {#if showRegisterRecoveryConfirm}
          <!-- Recovery confirmation step during registration -->
          <RecoveryConfirm
            generatedKey={regRecoveryKey}
            onConfirm={handleConfirmRegister}
            onCancel={handleCancelRegister}
          />
        {:else}
          <!-- Tabs for Login / Register -->
          <div class="tab-switcher">
            <button
              class="tab-btn {isLoginView ? 'active' : ''}"
              on:click={() => { isLoginView = true; regErrorMessage = ''; regSuccessMessage = ''; }}
            >
              Login
            </button>
            <button
              class="tab-btn {!isLoginView ? 'active' : ''}"
              on:click={() => { isLoginView = false; loginErrorMessage = ''; loginSuccessMessage = ''; }}
              disabled={!registrationEnabled}
            >
              Register
            </button>
          </div>

          {#if isLoginView}
            <form on:submit|preventDefault={handleLogin} class="auth-form">
              <div class="input-group">
                <label for="login-username">Username or Email</label>
                <input
                  id="login-username"
                  type="text"
                  placeholder="Enter your username"
                  bind:value={loginUsername}
                  required
                />
              </div>

              <div class="input-group">
                <label for="login-password">Password</label>
                <input
                  id="login-password"
                  type="password"
                  placeholder="Enter your password"
                  bind:value={loginPassword}
                  required
                />
              </div>

              {#if loginErrorMessage}
                <div class="error-banner">{loginErrorMessage}</div>
              {/if}
              {#if loginSuccessMessage}
                <div class="success-banner">{loginSuccessMessage}</div>
              {/if}

              <button type="submit" class="auth-btn submit-btn">
                Log In & Decrypt Vault Keys
              </button>
            </form>
          {:else}
            <!-- Register View -->
            {#if !registrationEnabled}
              <div class="disabled-banner">
                <p>🛡️ Public registration is currently disabled by the site administrator.</p>
              </div>
            {:else}
              <form on:submit|preventDefault={handleStartRegister} class="auth-form">
                <div class="input-group">
                  <label for="reg-username">Username or Email</label>
                  <input
                    id="reg-username"
                    type="text"
                    placeholder="Choose a username"
                    bind:value={regUsername}
                    required
                  />
                </div>

                <div class="input-group">
                  <label for="reg-password">Password (minimum 8 characters)</label>
                  <input
                    id="reg-password"
                    type="password"
                    placeholder="Create a strong password"
                    bind:value={regPassword}
                    required
                  />
                </div>

                {#if regErrorMessage}
                  <div class="error-banner">{regErrorMessage}</div>
                {/if}
                {#if regSuccessMessage}
                  <div class="info-banner">{regSuccessMessage}</div>
                {/if}

                <button type="submit" class="auth-btn submit-btn">
                  Generate Secure Cryptography Keys
                </button>
              </form>
            {/if}
          {/if}
        {/if}
      </div>
    </div>

  {:else if showCryptoSetupRequired}
    <!-- Crypto Setup Required Wizard -->
    <div class="auth-wrapper">
      <div class="auth-card crypto-setup-card">
        {#if cryptoSetupStep === 1}
          <div class="auth-header">
            <span class="auth-logo">🔑</span>
            <h1>Cryptographic Setup Required</h1>
            <p class="auth-subtitle">
              This account (e.g. initial admin or imported user) does not have any browser-generated encryption keys yet.
            </p>
          </div>

          <div class="warning-box">
            <p>
              <strong>Why is this required?</strong> KoalaFinance uses zero-knowledge client-side encryption.
              To enable private vault creation and secure record storage, your browser must generate a unique keypair.
            </p>
          </div>

          <form on:submit|preventDefault={handleStartCryptoSetup} class="auth-form">
            <div class="input-group">
              <label for="setup-password">Confirm Current Login Password</label>
              <input
                id="setup-password"
                type="password"
                placeholder="Enter password to derive key wrap"
                bind:value={cryptoSetupPassword}
                required
              />
            </div>

            {#if cryptoSetupErrorMessage}
              <div class="error-banner">{cryptoSetupErrorMessage}</div>
            {/if}
            {#if cryptoSetupSuccessMessage}
              <div class="info-banner">{cryptoSetupSuccessMessage}</div>
            {/if}

            <div class="setup-actions">
              <button type="button" class="cancel-btn" on:click={handleLogout}>Cancel / Logout</button>
              <button type="submit" class="auth-btn submit-btn">Generate Crypto Keys</button>
            </div>
          </form>
        {:else if cryptoSetupStep === 2}
          <RecoveryConfirm
            generatedKey={cryptoSetupRecoveryKey}
            onConfirm={handleConfirmCryptoSetup}
            onCancel={handleCancelCryptoSetup}
          />
        {/if}
      </div>
    </div>

  {:else if !decryptedPrivateKey}
    <!-- Keys Locked Overlay / Re-unlock screen -->
    <div class="auth-wrapper">
      <div class="auth-card unlock-card">
        <div class="auth-header">
          <span class="auth-logo">🔒</span>
          <h1>Vault Keys Locked</h1>
          <p class="auth-subtitle">
            Your session is active, but your client-side private key has been cleared from memory.
            Enter your password to restore access.
          </p>
        </div>

        <form on:submit|preventDefault={handleUnlock} class="auth-form">
          <div class="input-group">
            <label for="unlock-password">Login Password</label>
            <input
              id="unlock-password"
              type="password"
              placeholder="Enter password to decrypt key"
              bind:value={unlockPassword}
              required
            />
          </div>

          {#if unlockErrorMessage}
            <div class="error-banner">{unlockErrorMessage}</div>
          {/if}

          <div class="setup-actions">
            <button type="button" class="cancel-btn" on:click={handleLogout}>Logout Session</button>
            <button type="submit" class="auth-btn submit-btn">Unlock Vaults</button>
          </div>
        </form>
      </div>
    </div>

  {:else}
    <!-- Dashboard Shell -->
    <div class="dashboard-shell">
      <Sidebar
        activeTab={activeTab}
        onChangeTab={changeTab}
        currentUser={currentUser}
        isKeysUnlocked={!!decryptedPrivateKey}
        onLogout={handleLogout}
      />

      <div class="dashboard-content">
        {#if activeVaultKey && $storeWarning}
          <div class="store-warning-banner">
            <div class="warning-content">
              <span class="warning-icon">⚠️</span>
              <div class="warning-text">
                <strong>Partial Decryption Failure:</strong> {$storeWarning}
                <div class="warning-stats">
                  Loaded: {$totalRecordsLoaded} | Decrypted: {$successfullyDecryptedCount} | Skipped: {$skippedRecordsCount}
                </div>
              </div>
            </div>
            <button class="warning-reload-btn" on:click={refreshRecords}>
              🔄 Reload & Decrypt
            </button>
          </div>
        {/if}

        {#if ['accounts', 'categories', 'recurring', 'subscriptions'].includes(activeTab) && !activeVaultKey}
          <div class="locked-finance-view">
            <div class="locked-card">
              <span class="lock-icon">🔒</span>
              <h3>Vault Key Required</h3>
              <p>You must select and unlock an encrypted vault before you can view or manage financial data.</p>
              <button class="go-vaults-btn" on:click={() => activeTab = 'vaults'}>
                Go to Vaults Selection
              </button>
            </div>
          </div>
        {:else if activeTab === 'vaults'}
          <div class="vaults-view">
            <div class="view-header">
              <div>
                <h2>📦 Encrypted Vaults</h2>
                <p class="view-desc">Select an active vault or create a new one. All vault keys are wrapped with your RSA public key.</p>
              </div>
              <button class="create-vault-btn" on:click={handleCreateVault} disabled={!decryptedPrivateKey}>
                + Create New Vault
              </button>
            </div>

            {#if vaultCreationMessage}
              <div class="status-banner {vaultCreationMessage.includes('successfully') ? 'success' : 'info'}">
                {vaultCreationMessage}
              </div>
            {/if}

            <div class="vaults-layout">
              <div class="vaults-selector-section">
                <h3>Select Vault</h3>
                {#if vaultsList.length > 0}
                  <div class="vault-list-container">
                    {#each vaultsList as v}
                      <button
                        class="vault-row-card {selectedVaultId === v.id ? 'active' : ''}"
                        on:click={() => { selectedVaultId = v.id; selectVault(); }}
                      >
                        <div class="vault-icon">📦</div>
                        <div class="vault-meta">
                          <span class="vault-id">ID: <code>{v.id.substring(0, 16)}...</code></span>
                          <span class="vault-role">Your Role: <strong class="role-tag">{v.role}</strong></span>
                        </div>
                      </button>
                    {/each}
                  </div>
                {:else}
                  <div class="empty-state">
                    <p>No vaults found. Please create a new vault to start storing encrypted records.</p>
                  </div>
                {/if}
              </div>

              <div class="vault-records-section">
                <h3>Vault Contents & Verification</h3>
                {#if selectedVaultId}
                  <div class="records-container-card">
                    <div class="vault-header-info">
                      <span class="vault-info-title">Active Vault ID:</span>
                      <code>{selectedVaultId}</code>
                    </div>

                    <div class="test-record-form">
                      <h4>Write Test Record (E2E Encrypted)</h4>
                      <p class="tip-text">Records are encrypted client-side using AES-GCM-256 with a unique random IV before posting to the server.</p>
                      <textarea
                        class="json-textarea"
                        bind:value={plainRecordText}
                        placeholder="Enter record JSON"
                      ></textarea>

                      {#if recordStatus}
                        <div class="status-banner {recordStatus.includes('successfully') ? 'success' : 'error'}">
                          {recordStatus}
                        </div>
                      {/if}

                      <button class="save-record-btn" on:click={saveRecord} disabled={!activeVaultKey}>
                        🔒 Encrypt and Save Record
                      </button>
                    </div>

                    <div class="records-list-wrapper">
                      <div class="records-list-header">
                        <h4>Decrypted Vault Records ({decryptedRecords.length})</h4>
                        <button class="refresh-records-btn" on:click={fetchAndDecryptRecords} disabled={!activeVaultKey}>
                          🔄 Reload & Decrypt
                        </button>
                      </div>

                      <div class="records-scroll-area">
                        {#each decryptedRecords as rec}
                          <div class="record-card-item">
                            <div class="record-meta-header">
                              <span class="rec-id-badge">ID: <code>{rec.id}</code></span>
                              <span class="rec-rev-badge">Revision: {rec.raw.revision}</span>
                            </div>

                            {#if rec.error}
                              <div class="decryption-error-msg">❌ {rec.error}</div>
                            {:else}
                              <pre class="record-json-block">{JSON.stringify(rec.payload, null, 2)}</pre>
                            {/if}
                            
                            <details class="record-raw-details">
                              <summary>View database ciphertext envelope</summary>
                              <pre class="raw-envelope-block">{JSON.stringify(rec.raw, null, 2)}</pre>
                            </details>
                          </div>
                        {:else}
                          <div class="empty-records-state">
                            <p>No records stored in this vault yet.</p>
                          </div>
                        {/each}
                      </div>
                    </div>
                  </div>
                {:else}
                  <div class="empty-state select-prompt">
                    <p>Select a vault on the left to view records and execute cryptographic operations.</p>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {:else if activeTab === 'accounts'}
          <AccountsView {csrfToken} />
        {:else if activeTab === 'categories'}
          <CategoriesView {csrfToken} />
        {:else if activeTab === 'recurring'}
          <RecurringItemsView {csrfToken} />
        {:else if activeTab === 'subscriptions'}
          <SubscriptionsView />
        {:else if activeTab === 'admin' && currentUser.role === 'admin'}
          <AdminPanel csrfToken={csrfToken} />
        {:else if activeTab === 'debug'}
          <DebugPanel
            currentUser={currentUser}
            decryptedPrivateKey={decryptedPrivateKey}
            activeVaultKey={activeVaultKey}
            vaultsList={vaultsList}
            selectedVaultId={selectedVaultId}
            onSelectVault={selectVault}
            onCreateVault={handleCreateVault}
            vaultCreationMessage={vaultCreationMessage}
            plainRecordText={plainRecordText}
            onSaveRecord={saveRecord}
            recordStatus={recordStatus}
            decryptedRecords={decryptedRecords}
            onReloadRecords={fetchAndDecryptRecords}
            onClearKeys={clearKeys}
          />
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  :global(body) {
    background-color: #0b0f19;
    color: #cbd5e1;
    font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    margin: 0;
    padding: 0;
    overflow-x: hidden;
  }

  .app-layout {
    min-height: 100vh;
    display: flex;
    background: radial-gradient(circle at 80% 20%, #151d30 0%, #090d16 100%);
  }

  /* Auth Screens Styles */
  .auth-wrapper {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    min-height: 100vh;
    padding: 1.5rem;
    box-sizing: border-box;
  }

  .auth-card {
    background: rgba(17, 24, 39, 0.7);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 2.5rem;
    width: 100%;
    max-width: 500px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  }

  .crypto-setup-card, .unlock-card {
    max-width: 650px;
  }

  .auth-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .auth-logo {
    font-size: 3.5rem;
    display: block;
    margin-bottom: 1rem;
    filter: drop-shadow(0 0 12px rgba(88, 166, 255, 0.4));
  }

  h1 {
    color: #f8fafc;
    font-size: 1.75rem;
    font-weight: 700;
    margin: 0 0 0.5rem 0;
    letter-spacing: -0.02em;
  }

  .auth-subtitle {
    color: #94a3b8;
    font-size: 0.95rem;
    line-height: 1.5;
    margin: 0;
  }

  .tab-switcher {
    display: flex;
    background-color: #0f172a;
    padding: 0.25rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    border: 1px solid #1e293b;
  }

  .tab-btn {
    flex: 1;
    background: none;
    border: none;
    color: #64748b;
    padding: 0.6rem;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.2s ease;
  }

  .tab-btn.active {
    background-color: #1e293b;
    color: #38bdf8;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .tab-btn:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  .auth-form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .input-group label {
    font-size: 0.85rem;
    font-weight: 600;
    color: #94a3b8;
  }

  input, textarea {
    background-color: #090d16;
    border: 1px solid #1e293b;
    border-radius: 8px;
    color: #f1f5f9;
    padding: 0.75rem 1rem;
    font-size: 0.95rem;
    transition: all 0.2s ease;
  }

  input:focus, textarea:focus {
    border-color: #38bdf8;
    box-shadow: 0 0 8px rgba(56, 189, 248, 0.3);
    outline: none;
  }

  .auth-btn {
    background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%);
    border: none;
    color: white;
    font-weight: 600;
    padding: 0.8rem;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .auth-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
  }

  .submit-btn {
    margin-top: 0.5rem;
  }

  .cancel-btn {
    background-color: #1e293b;
    border: 1px solid #334155;
    color: #94a3b8;
    padding: 0.8rem;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .cancel-btn:hover {
    background-color: #334155;
    color: #f1f5f9;
  }

  .setup-actions {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 0.75rem;
  }

  .warning-box {
    background-color: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1.5rem;
    font-size: 0.88rem;
    color: #f59e0b;
    line-height: 1.5;
  }

  .disabled-banner {
    background-color: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 8px;
    padding: 1.2rem;
    color: #f87171;
    font-size: 0.9rem;
    text-align: center;
    line-height: 1.5;
  }

  .error-banner {
    background-color: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
    color: #f87171;
    padding: 0.75rem;
    border-radius: 8px;
    font-size: 0.85rem;
    line-height: 1.4;
  }

  .success-banner {
    background-color: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.2);
    color: #34d399;
    padding: 0.75rem;
    border-radius: 8px;
    font-size: 0.85rem;
    line-height: 1.4;
  }

  .info-banner {
    background-color: rgba(56, 189, 248, 0.1);
    border: 1px solid rgba(56, 189, 248, 0.2);
    color: #38bdf8;
    padding: 0.75rem;
    border-radius: 8px;
    font-size: 0.85rem;
    line-height: 1.4;
  }

  /* Dashboard Layout Styles */
  .dashboard-shell {
    display: flex;
    width: 100%;
    min-height: 100vh;
  }

  .dashboard-content {
    flex-grow: 1;
    margin-left: 260px; /* Width of fixed sidebar */
    padding: 2.5rem;
    box-sizing: border-box;
    overflow-y: auto;
  }

  /* Vaults View Styles */
  .vaults-view {
    max-width: 1100px;
    margin: 0 auto;
  }

  .view-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
    border-bottom: 1px solid #1e293b;
    padding-bottom: 1.5rem;
  }

  .view-header h2 {
    color: #f8fafc;
    font-size: 1.75rem;
    margin: 0 0 0.25rem 0;
  }

  .view-desc {
    color: #94a3b8;
    font-size: 0.95rem;
    margin: 0;
  }

  .create-vault-btn {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border: none;
    color: white;
    font-weight: 600;
    padding: 0.75rem 1.25rem;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .create-vault-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  }

  .status-banner {
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    font-size: 0.9rem;
  }

  .status-banner.success {
    background-color: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.3);
    color: #34d399;
  }

  .status-banner.error {
    background-color: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #f87171;
  }

  .status-banner.info {
    background-color: rgba(56, 189, 248, 0.1);
    border: 1px solid rgba(56, 189, 248, 0.3);
    color: #38bdf8;
  }

  .vaults-layout {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 2rem;
  }

  .vaults-selector-section h3, .vault-records-section h3 {
    color: #cbd5e1;
    font-size: 1.1rem;
    margin: 0 0 1.2rem 0;
  }

  .vault-list-container {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .vault-row-card {
    background: #111827;
    border: 1px solid #1e293b;
    border-radius: 10px;
    padding: 1rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    cursor: pointer;
    text-align: left;
    width: 100%;
    box-sizing: border-box;
    transition: all 0.2s ease;
  }

  .vault-row-card:hover {
    border-color: #334155;
    background-color: #172033;
  }

  .vault-row-card.active {
    border-color: #38bdf8;
    background-color: rgba(56, 189, 248, 0.05);
    box-shadow: 0 0 12px rgba(56, 189, 248, 0.1);
  }

  .vault-icon {
    font-size: 1.5rem;
  }

  .vault-meta {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .vault-id {
    color: #cbd5e1;
    font-size: 0.9rem;
  }

  .vault-id code {
    font-family: monospace;
    color: #38bdf8;
  }

  .vault-role {
    color: #64748b;
    font-size: 0.8rem;
  }

  .role-tag {
    color: #f59e0b;
    text-transform: uppercase;
  }

  .empty-state {
    background-color: #111827;
    border: 1px dashed #1e293b;
    border-radius: 10px;
    padding: 2.5rem 1.5rem;
    text-align: center;
    color: #64748b;
    font-size: 0.9rem;
    line-height: 1.6;
  }

  .empty-state.select-prompt {
    padding: 5rem 2rem;
  }

  .records-container-card {
    background-color: #111827;
    border: 1px solid #1e293b;
    border-radius: 12px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .vault-header-info {
    background-color: #090d16;
    border: 1px solid #1e293b;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    font-size: 0.85rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .vault-info-title {
    color: #64748b;
    font-weight: 600;
  }

  .vault-header-info code {
    color: #f43f5e;
    font-family: monospace;
  }

  .test-record-form {
    background-color: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 10px;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .test-record-form h4 {
    margin: 0;
    color: #f1f5f9;
    font-size: 1rem;
  }

  .tip-text {
    font-size: 0.78rem;
    color: #64748b;
    line-height: 1.4;
    margin: 0;
  }

  .json-textarea {
    font-family: monospace;
    font-size: 0.85rem;
    height: 90px;
    background-color: #090d16;
    resize: none;
  }

  .save-record-btn {
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    border: none;
    color: white;
    font-weight: 600;
    padding: 0.65rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .save-record-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 10px rgba(37, 99, 235, 0.3);
  }

  .records-list-wrapper {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .records-list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .records-list-header h4 {
    margin: 0;
    color: #f1f5f9;
    font-size: 1rem;
  }

  .refresh-records-btn {
    background-color: #1e293b;
    border: 1px solid #334155;
    color: #cbd5e1;
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0.4rem 0.8rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .refresh-records-btn:hover {
    background-color: #334155;
    color: #f1f5f9;
  }

  .records-scroll-area {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-height: 400px;
    overflow-y: auto;
    padding-right: 0.25rem;
  }

  .record-card-item {
    background-color: #090d16;
    border: 1px solid #1e293b;
    border-radius: 8px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .record-meta-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.75rem;
  }

  .rec-id-badge code {
    color: #38bdf8;
    font-family: monospace;
  }

  .rec-rev-badge {
    color: #64748b;
  }

  .decryption-error-msg {
    color: #f87171;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .record-json-block {
    margin: 0;
    background-color: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 6px;
    padding: 0.75rem;
    font-family: monospace;
    font-size: 0.85rem;
    color: #e2e8f0;
    overflow-x: auto;
    white-space: pre-wrap;
  }

  .record-raw-details {
    font-size: 0.78rem;
    color: #64748b;
  }

  .record-raw-details summary {
    cursor: pointer;
    outline: none;
    user-select: none;
  }

  .raw-envelope-block {
    margin-top: 0.5rem;
    margin-bottom: 0;
    background-color: #0b0f19;
    border: 1px solid #1e293b;
    border-radius: 6px;
    padding: 0.6rem;
    font-family: monospace;
    font-size: 0.75rem;
    color: #475569;
    overflow-x: auto;
  }

  .empty-records-state {
    background-color: #090d16;
    border: 1px dashed #1e293b;
    border-radius: 8px;
    padding: 2rem;
    text-align: center;
    color: #475569;
    font-size: 0.85rem;
  }

  /* Locked finance view */
  .locked-finance-view {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 60vh;
    width: 100%;
  }

  .locked-card {
    background: rgba(17, 24, 39, 0.6);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 3rem 2rem;
    max-width: 450px;
    text-align: center;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .lock-icon {
    font-size: 3rem;
    display: block;
    margin-bottom: 1.5rem;
    filter: drop-shadow(0 0 12px rgba(244, 63, 94, 0.3));
  }

  .locked-card h3 {
    color: #f8fafc;
    margin: 0 0 0.75rem 0;
    font-size: 1.35rem;
  }

  .locked-card p {
    color: #94a3b8;
    font-size: 0.95rem;
    line-height: 1.6;
    margin: 0 0 2rem 0;
  }

  .go-vaults-btn {
    background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%);
    border: none;
    color: white;
    font-weight: 600;
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .go-vaults-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
  }

  /* Store Warning Banner */
  .store-warning-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 10px;
    padding: 1rem 1.25rem;
    margin-bottom: 2rem;
    color: #f59e0b;
  }

  .warning-content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .warning-icon {
    font-size: 1.5rem;
  }

  .warning-text {
    font-size: 0.9rem;
    line-height: 1.4;
  }

  .warning-stats {
    font-size: 0.8rem;
    color: #d97706;
    margin-top: 0.25rem;
  }

  .warning-reload-btn {
    background-color: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.4);
    color: #f59e0b;
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0.4rem 0.8rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .warning-reload-btn:hover {
    background-color: rgba(245, 158, 11, 0.25);
  }
</style>
