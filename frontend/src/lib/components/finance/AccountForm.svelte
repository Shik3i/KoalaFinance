<script lang="ts">
  import type { AccountRecord, AccountType, LoadedFinanceRecord } from "../../finance/types";
  import { saveRecord } from "../../finance/store";
  import MoneyInput from "./MoneyInput.svelte";

  export let editingAccount: LoadedFinanceRecord<AccountRecord> | undefined = undefined;
  export let csrfToken = "";
  export let onClose: () => void;

  let name = editingAccount?.payload.name ?? "";
  let type: AccountType = editingAccount?.payload.type ?? "checking";
  let balanceMode: "manual" | "calculated" | "none" = editingAccount?.payload.balanceMode ?? "manual";
  let openingBalanceMinor: number | undefined = editingAccount?.payload.openingBalanceMinor;
  let currentBalanceMinor: number | undefined = editingAccount?.payload.currentBalanceMinor;
  let archived = editingAccount?.payload.archived ?? false;

  let errorMessage = "";
  let loading = false;

  async function handleSubmit() {
    errorMessage = "";
    if (!name.trim()) {
      errorMessage = "Account name is required";
      return;
    }

    loading = true;
    try {
      const timestamp = new Date().toISOString();
      const id = editingAccount?.payload.id ?? crypto.randomUUID();

      const accountPayload: AccountRecord = {
        schemaVersion: 1,
        id,
        name: name.trim(),
        type,
        currency: "EUR",
        openingBalanceMinor: openingBalanceMinor ?? 0,
        balanceMode,
        currentBalanceMinor: balanceMode === "manual" ? (currentBalanceMinor ?? 0) : undefined,
        archived,
        createdAt: editingAccount?.payload.createdAt ?? timestamp,
        updatedAt: timestamp
      };

      await saveRecord("account", accountPayload, editingAccount?.recordId, csrfToken);
      onClose();
    } catch (err: any) {
      console.error(err);
      errorMessage = err.message || "Failed to save account";
    } finally {
      loading = false;
    }
  }
</script>

<div class="modal-backdrop">
  <div class="modal-card">
    <div class="modal-header">
      <h3>{editingAccount ? "Edit Account" : "Add Account"}</h3>
      <button class="close-btn" on:click={onClose}>&times;</button>
    </div>

    {#if errorMessage}
      <div class="error-banner">
        {errorMessage}
      </div>
    {/if}

    <form on:submit|preventDefault={handleSubmit}>
      <div class="form-group">
        <label for="acc-name">Account Name</label>
        <input
          type="text"
          id="acc-name"
          bind:value={name}
          placeholder="e.g. Checking Account"
          required
          maxlength="120"
        />
      </div>

      <div class="form-group-row">
        <div class="form-group">
          <label for="acc-type">Account Type</label>
          <select id="acc-type" bind:value={type}>
            <option value="checking">Checking</option>
            <option value="savings">Savings</option>
            <option value="cash">Cash</option>
            <option value="credit_card">Credit Card</option>
            <option value="paypal">PayPal</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div class="form-group">
          <label for="acc-mode">Balance Mode</label>
          <select id="acc-mode" bind:value={balanceMode}>
            <option value="manual">Manual Balance</option>
            <option value="calculated">Calculated (Future)</option>
            <option value="none">No Balance Tracker</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label for="acc-opening">Opening Balance (EUR)</label>
        <MoneyInput
          id="acc-opening"
          bind:value={openingBalanceMinor}
          signed={true}
          placeholder="0.00"
        />
      </div>

      {#if balanceMode === "manual"}
        <div class="form-group">
          <label for="acc-current">Current Balance (EUR)</label>
          <MoneyInput
            id="acc-current"
            bind:value={currentBalanceMinor}
            signed={true}
            placeholder="0.00"
          />
        </div>
      {:else if balanceMode === "calculated"}
        <div class="info-box">
          ℹ️ Calculated balance tracker will be available after transaction ledger implementation.
        </div>
      {/if}

      {#if editingAccount}
        <div class="form-group checkbox-group">
          <label>
            <input type="checkbox" bind:checked={archived} />
            Archive this account (hides it from active selectors)
          </label>
        </div>
      {/if}

      <div class="form-actions">
        <button type="button" class="cancel-btn" on:click={onClose} disabled={loading}>
          Cancel
        </button>
        <button type="submit" class="submit-btn" disabled={loading}>
          {loading ? "Saving..." : "Save Account"}
        </button>
      </div>
    </form>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .modal-card {
    background-color: #161b22;
    border: 1px solid #30363d;
    border-radius: 12px;
    width: 100%;
    max-width: 500px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    padding: 1.5rem;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #30363d;
    padding-bottom: 0.8rem;
  }

  .modal-header h3 {
    margin: 0;
    color: #f0f6fc;
    font-size: 1.2rem;
  }

  .close-btn {
    background: none;
    border: none;
    color: #8b949e;
    font-size: 1.5rem;
    cursor: pointer;
    line-height: 1;
    padding: 0;
  }

  .close-btn:hover {
    color: #c9d1d9;
  }

  .error-banner {
    background-color: rgba(248, 81, 73, 0.15);
    border: 1px solid #f85149;
    color: #ff7b72;
    border-radius: 6px;
    padding: 0.8rem;
    font-size: 0.85rem;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .form-group-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  label {
    color: #c9d1d9;
    font-size: 0.9rem;
    font-weight: 500;
  }

  input[type="text"],
  select {
    padding: 0.6rem 0.8rem;
    background-color: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #c9d1d9;
    font-size: 0.95rem;
    font-family: inherit;
    box-sizing: border-box;
    transition: border-color 0.15s ease;
  }

  input[type="text"]:focus,
  select:focus {
    border-color: #58a6ff;
    outline: none;
  }

  .checkbox-group {
    flex-direction: row;
    align-items: center;
    gap: 0.6rem;
  }

  .checkbox-group label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 0.85rem;
    color: #8b949e;
  }

  .info-box {
    background-color: rgba(56, 139, 253, 0.1);
    border: 1px dashed #388bfd;
    color: #58a6ff;
    border-radius: 6px;
    padding: 0.8rem;
    font-size: 0.8rem;
    line-height: 1.4;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.8rem;
    border-top: 1px solid #30363d;
    padding-top: 1rem;
    margin-top: 0.5rem;
  }

  .cancel-btn {
    background: none;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #c9d1d9;
    padding: 0.6rem 1rem;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
  }

  .cancel-btn:hover:not(:disabled) {
    background-color: #21262d;
  }

  .submit-btn {
    background-color: #238636;
    border: 1px solid #2ea043;
    border-radius: 6px;
    color: #ffffff;
    padding: 0.6rem 1rem;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .submit-btn:hover:not(:disabled) {
    background-color: #2ea043;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
