<script lang="ts">
  export let generatedKey: string;
  export let onConfirm: () => void;
  export let onCancel: () => void;

  let userInput = '';
  let errorMessage = '';

  $: isMatch = userInput.toUpperCase().replace(/[\s-]/g, '') === generatedKey.toUpperCase().replace(/[\s-]/g, '');

  function handleConfirm() {
    if (isMatch) {
      onConfirm();
    } else {
      errorMessage = 'The recovery key does not match. Please verify and try again.';
    }
  }
</script>

<div class="recovery-container">
  <h2>⚠️ Critical Security: Save Your Recovery Key</h2>
  <p class="warning-text">
    KoalaFinance uses end-to-end client-side encryption. The server does not know your password or recovery key.
    <strong>If you lose both your password and your recovery key, your financial data is permanently lost.</strong>
    The site admin cannot recover your data.
  </p>

  <div class="key-box">
    <span class="label">YOUR RECOVERY KEY:</span>
    <code class="recovery-display">{generatedKey}</code>
  </div>

  <p class="instruction">
    Please copy, write down, or print this key, and store it in a password manager or physical vault.
    To confirm you have saved it, type or paste the recovery key below:
  </p>

  <div class="confirm-input-group">
    <input
      type="text"
      placeholder="Type or paste recovery key here"
      bind:value={userInput}
      class={isMatch ? 'match' : userInput ? 'no-match' : ''}
    />
    {#if userInput && !isMatch}
      <span class="status no-match-status">❌ Does not match yet</span>
    {/if}
    {#if isMatch}
      <span class="status match-status">✅ Key confirmed</span>
    {/if}
  </div>

  {#if errorMessage}
    <p class="error-msg">{errorMessage}</p>
  {/if}

  <div class="actions">
    <button class="cancel-btn" on:click={onCancel}>Go Back</button>
    <button class="primary-btn" on:click={handleConfirm} disabled={!isMatch}>
      Save & Enable Cryptography
    </button>
  </div>
</div>

<style>
  .recovery-container {
    background-color: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 2rem;
    max-width: 600px;
    margin: 2rem auto;
  }

  h2 {
    color: #d29922;
    font-size: 1.5rem;
    margin-top: 0;
    margin-bottom: 1rem;
  }

  .warning-text {
    color: #e6edf3;
    font-size: 0.95rem;
    line-height: 1.5;
    margin-bottom: 1.5rem;
  }

  .warning-text strong {
    color: #ff7b72;
  }

  .key-box {
    background-color: #1f1b0d;
    border: 1px solid #d29922;
    border-radius: 6px;
    padding: 1.2rem;
    margin-bottom: 1.5rem;
    text-align: center;
  }

  .label {
    display: block;
    color: #8b949e;
    font-size: 0.8rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
    letter-spacing: 0.05em;
  }

  .recovery-display {
    color: #ff7b72;
    font-family: monospace;
    font-size: 1.15rem;
    font-weight: bold;
    word-break: break-all;
    user-select: all; /* Easier to copy */
  }

  .instruction {
    font-size: 0.9rem;
    color: #8b949e;
    line-height: 1.4;
    margin-bottom: 1.2rem;
  }

  .confirm-input-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }

  input {
    background-color: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #c9d1d9;
    padding: 0.8rem;
    font-family: monospace;
    font-size: 1rem;
    text-align: center;
    width: 90%;
    margin: 0 auto;
  }

  input:focus {
    outline: none;
    border-color: #58a6ff;
  }

  input.match {
    border-color: #238636;
    background-color: #0f1c12;
  }

  input.no-match {
    border-color: #da3637;
    background-color: #221515;
  }

  .status {
    font-size: 0.85rem;
    text-align: center;
    font-weight: 600;
  }

  .match-status {
    color: #56d364;
  }

  .no-match-status {
    color: #f85149;
  }

  .error-msg {
    color: #f85149;
    font-size: 0.85rem;
    text-align: center;
    margin-bottom: 1rem;
  }

  .actions {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 1.5rem;
  }

  button {
    border-radius: 6px;
    padding: 0.7rem 1.2rem;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
  }

  .cancel-btn {
    background-color: #21262d;
    border: 1px solid #30363d;
    color: #c9d1d9;
  }

  .cancel-btn:hover {
    background-color: #30363d;
  }

  .primary-btn {
    background-color: #238636;
    border: 1px solid rgba(240, 246, 252, 0.1);
    color: #ffffff;
    flex-grow: 1;
  }

  .primary-btn:hover:not(:disabled) {
    background-color: #2ea043;
  }

  .primary-btn:disabled {
    background-color: #21262d;
    color: #8b949e;
    cursor: not-allowed;
  }
</style>
