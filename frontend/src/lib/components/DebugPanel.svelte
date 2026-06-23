<script lang="ts">
  export let currentUser: any;
  export let decryptedPrivateKey: CryptoKey | null;
  export let activeVaultKey: CryptoKey | null;
  
  export let vaultsList: any[];
  export let selectedVaultId: string;
  export let onSelectVault: () => void;
  export let onCreateVault: () => void;
  export let vaultCreationMessage: string;

  export let plainRecordText: string;
  export let onSaveRecord: () => void;
  export let recordStatus: string;

  export let decryptedRecords: any[];
  export let onReloadRecords: () => void;
  export let onClearKeys: () => void;

  let showRawKeysInfo = false;
</script>

<div class="debug-panel">
  <div class="warning-banner">
    <h3>🛠️ Developer Verification Harness</h3>
    <p>
      This is a temporary debug playground used to verify client-side Web Crypto operations and REST API roundtrips.
      No plaintext key material, passwords, or decrypted payloads are printed to the browser console.
      This panel will be hidden or removed in post-foundation UI releases.
    </p>
  </div>

  <div class="debug-grid">
    <!-- Key Material Status Card -->
    <div class="debug-card">
      <h4>In-Memory Key Diagnostics</h4>
      <div class="key-status-list">
        <div class="status-row">
          <span>Private Key Type:</span>
          <span class="value">{decryptedPrivateKey ? decryptedPrivateKey.type : 'Locked'}</span>
        </div>
        <div class="status-row">
          <span>Private Key Extractable:</span>
          <span class="value">{decryptedPrivateKey ? decryptedPrivateKey.extractable : 'false'}</span>
        </div>
        <div class="status-row">
          <span>Vault Key Loaded:</span>
          <span class="value {activeVaultKey ? 'active' : ''}">
            {activeVaultKey ? 'Yes (AES-GCM)' : 'No'}
          </span>
        </div>
      </div>

      <div class="actions">
        {#if decryptedPrivateKey}
          <button class="warn-btn" on:click={onClearKeys}>
            Clear Keys in Memory (Simulate Reload)
          </button>
        {/if}
        <button class="secondary-btn" on:click={() => showRawKeysInfo = !showRawKeysInfo}>
          {showRawKeysInfo ? 'Hide Key Metadata' : 'Show Key Metadata'}
        </button>
      </div>

      {#if showRawKeysInfo}
        <div class="raw-info">
          <h5>JWK Metadata Details</h5>
          <pre>User Public Key (SPKI): {currentUser && currentUser.public_key ? currentUser.public_key.substring(0, 30) + '...' : 'None'}</pre>
          <pre>Algorithm: RSA-OAEP-3072 / SHA-256</pre>
          <pre>Vault Key Wrapping: RSA-OAEP-3072</pre>
        </div>
      {/if}
    </div>

    <!-- Vault Setup Card -->
    <div class="debug-card">
      <h4>Vault Configuration</h4>
      <div class="form-group">
        <button class="primary-btn" on:click={onCreateVault} disabled={!decryptedPrivateKey}>
          Create New Vault & Wrap Key
        </button>
        {#if vaultCreationMessage}
          <p class="status-text">{vaultCreationMessage}</p>
        {/if}
      </div>

      {#if vaultsList.length > 0}
        <div class="form-group">
          <label for="vault-select-debug">Active Vault ID:</label>
          <select id="vault-select-debug" bind:value={selectedVaultId} on:change={onSelectVault}>
            {#each vaultsList as v}
              <option value={v.id}>{v.id.substring(0, 12)}... ({v.role})</option>
            {/each}
          </select>
        </div>
      {:else}
        <p class="tip-text">No vaults exist. Create a vault above to begin.</p>
      {/if}
    </div>

    <!-- Record Cryptography Card -->
    <div class="debug-card span-2">
      <h4>Record Cryptography (AES-GCM-256)</h4>
      <div class="records-layout">
        <div>
          <h5>1. Encrypt and Post Record</h5>
          <p class="tip-text">Enter plain JSON payload. Clicking Encrypt generates a 96-bit random nonce and submits GCM ciphertext:</p>
          <textarea class="code-editor" bind:value={plainRecordText}></textarea>
          <button class="primary-btn" on:click={onSaveRecord} disabled={!activeVaultKey}>
            Encrypt & Upload to Go Server
          </button>
          {#if recordStatus}
            <p class="status-text">{recordStatus}</p>
          {/if}
        </div>

        <div>
          <h5>2. Fetch and Decrypt Records</h5>
          <button class="secondary-btn" on:click={onReloadRecords} disabled={!activeVaultKey}>
            Pull & Decrypt Records
          </button>
          <div class="records-log">
            {#each decryptedRecords as rec}
              <div class="log-item">
                <div class="log-header">
                  <span>Record ID: <code>{rec.id}</code></span>
                  <span>Revision: <code>{rec.raw.revision}</code></span>
                </div>
                {#if rec.error}
                  <p class="error-msg">{rec.error}</p>
                {:else}
                  <pre class="json-out">{JSON.stringify(rec.payload, null, 2)}</pre>
                {/if}
                <details class="ciphertext-details">
                  <summary>View Database Ciphertext Envelope</summary>
                  <pre class="raw-json">{JSON.stringify(rec.raw, null, 2)}</pre>
                </details>
              </div>
            {:else}
              <p class="tip-text">No records loaded or decrypted.</p>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .debug-panel {
    width: 100%;
  }

  .warning-banner {
    background-color: #1b1c1d;
    border: 1px dashed #d29922;
    border-radius: 8px;
    padding: 1rem 1.5rem;
    margin-bottom: 2rem;
  }

  .warning-banner h3 {
    color: #d29922;
    margin-top: 0;
    margin-bottom: 0.4rem;
  }

  .warning-banner p {
    color: #8b949e;
    font-size: 0.85rem;
    line-height: 1.4;
    margin: 0;
  }

  .debug-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
  }

  .span-2 {
    grid-column: span 2;
  }

  .debug-card {
    background-color: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 1.5rem;
  }

  h4 {
    color: #f0f6fc;
    font-size: 1.1rem;
    margin-top: 0;
    margin-bottom: 1.2rem;
    border-bottom: 1px solid #21262d;
    padding-bottom: 0.5rem;
  }

  h5 {
    color: #f0f6fc;
    font-size: 0.95rem;
    margin-top: 0;
    margin-bottom: 0.5rem;
  }

  .key-status-list {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-bottom: 1.5rem;
  }

  .status-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.9rem;
    color: #8b949e;
  }

  .status-row .value {
    color: #f0f6fc;
    font-family: monospace;
  }

  .status-row .value.active {
    color: #56d364;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  button {
    border-radius: 6px;
    padding: 0.6rem;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
  }

  .primary-btn {
    background-color: #238636;
    border: 1px solid rgba(240, 246, 252, 0.1);
    color: #ffffff;
  }

  .primary-btn:hover:not(:disabled) {
    background-color: #2ea043;
  }

  .primary-btn:disabled {
    background-color: #21262d;
    color: #8b949e;
    cursor: not-allowed;
  }

  .secondary-btn {
    background-color: #21262d;
    border: 1px solid #30363d;
    color: #c9d1d9;
  }

  .secondary-btn:hover:not(:disabled) {
    background-color: #30363d;
  }

  .secondary-btn:disabled {
    background-color: #161b22;
    color: #484f58;
    cursor: not-allowed;
  }

  .warn-btn {
    background-color: #da3637;
    border: 1px solid rgba(240, 246, 252, 0.1);
    color: #ffffff;
  }

  .warn-btn:hover {
    background-color: #f85149;
  }

  .raw-info {
    margin-top: 1.5rem;
    background-color: #0d1117;
    border: 1px solid #21262d;
    border-radius: 6px;
    padding: 0.8rem;
    font-family: monospace;
    font-size: 0.75rem;
    color: #8b949e;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    margin-bottom: 1rem;
  }

  select {
    background-color: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #c9d1d9;
    padding: 0.6rem;
  }

  .status-text {
    font-size: 0.85rem;
    color: #8b949e;
    margin-top: 0.5rem;
  }

  .tip-text {
    font-size: 0.8rem;
    color: #8b949e;
    margin-bottom: 0.5rem;
  }

  .records-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
  }

  .code-editor {
    width: 95%;
    height: 100px;
    background-color: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #c9d1d9;
    padding: 0.6rem;
    font-family: monospace;
    font-size: 0.85rem;
    margin-bottom: 0.8rem;
    resize: none;
  }

  .records-log {
    background-color: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    height: 250px;
    overflow-y: auto;
    padding: 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    margin-top: 0.8rem;
  }

  .log-item {
    background-color: #161b22;
    border: 1px solid #30363d;
    border-radius: 4px;
    padding: 0.6rem;
  }

  .log-header {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: #8b949e;
    margin-bottom: 0.4rem;
  }

  .json-out {
    font-family: monospace;
    font-size: 0.85rem;
    color: #e6edf3;
    margin: 0;
    white-space: pre-wrap;
    background-color: #0d1117;
    padding: 0.4rem;
    border-radius: 4px;
  }

  .ciphertext-details {
    font-size: 0.75rem;
    color: #8b949e;
    margin-top: 0.5rem;
    cursor: pointer;
  }

  .raw-json {
    background-color: #0d1117;
    padding: 0.4rem;
    border-radius: 4px;
    overflow-x: auto;
    margin-top: 0.3rem;
  }
</style>
