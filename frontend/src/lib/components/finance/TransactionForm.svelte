<script lang="ts">
  import type { TransactionRecord, TransactionSplit, LoadedFinanceRecord } from "../../finance/types";
  import { saveRecord } from "../../finance/store";
  import { formatMinorAsEuro } from "../../finance/money";
  import AccountSelect from "./AccountSelect.svelte";
  import CategorySelect from "./CategorySelect.svelte";
  import MoneyInput from "./MoneyInput.svelte";

  export let editingTransaction: LoadedFinanceRecord<TransactionRecord> | undefined = undefined;
  export let csrfToken = "";
  export let onClose: () => void;

  let date = editingTransaction?.payload.date ?? new Date().toISOString().substring(0, 10);
  let type: "income" | "expense" | "transfer" = editingTransaction?.payload.type ?? "expense";
  let accountId = editingTransaction?.payload.accountId ?? "";
  let destinationAccountId = editingTransaction?.payload.destinationAccountId ?? "";
  let payee = editingTransaction?.payload.payee ?? "";
  let totalAmountMinor = editingTransaction?.payload.totalAmountMinor ?? 0;
  let notes = editingTransaction?.payload.notes ?? "";
  let archived = editingTransaction?.payload.archived ?? false;

  // Split management state
  let isSplitEnabled = editingTransaction ? editingTransaction.payload.splits.length > 1 : false;
  
  // Single category select state (when splits is not enabled)
  let singleCategoryId = (editingTransaction && editingTransaction.payload.splits.length > 0)
    ? editingTransaction.payload.splits[0].categoryId
    : "";

  interface FormSplit {
    id: string;
    categoryId: string;
    amountMinor: number;
    note: string;
  }

  let splits: FormSplit[] = (editingTransaction && editingTransaction.payload.splits.length > 0)
    ? editingTransaction.payload.splits.map(s => ({
        id: s.id,
        categoryId: s.categoryId,
        amountMinor: s.amountMinor,
        note: s.note ?? ""
      }))
    : [{ id: crypto.randomUUID(), categoryId: "", amountMinor: 0, note: "" }];

  let errorMessage = "";
  let loading = false;

  // React to type changes
  $: {
    if (type === "transfer") {
      isSplitEnabled = false;
    }
  }

  $: splitsSum = splits.reduce((sum, s) => sum + s.amountMinor, 0);
  $: splitsDifference = totalAmountMinor - splitsSum;

  function addSplitRow() {
    splits = [...splits, { id: crypto.randomUUID(), categoryId: "", amountMinor: 0, note: "" }];
  }

  function removeSplitRow(idx: number) {
    if (splits.length <= 1) return;
    splits = splits.filter((_, i) => i !== idx);
  }

  function distributeRemaining() {
    if (splits.length === 0) return;
    const diff = splitsDifference;
    if (diff <= 0) return;
    splits[splits.length - 1].amountMinor += diff;
    splits = [...splits]; // trigger updates
  }

  async function handleSubmit() {
    errorMessage = "";

    if (!date) {
      errorMessage = "Transaction date is required";
      return;
    }

    if (totalAmountMinor <= 0) {
      errorMessage = "Transaction total amount must be positive";
      return;
    }

    let finalSplits: TransactionSplit[] = [];

    if (type === "transfer") {
      if (!accountId) {
        errorMessage = "Source Account is required for transfers";
        return;
      }
      if (!destinationAccountId) {
        errorMessage = "Destination Account is required for transfers";
        return;
      }
      if (accountId === destinationAccountId) {
        errorMessage = "Source and destination accounts must be different";
        return;
      }
      // Transfers have empty splits
      finalSplits = [];
    } else {
      // Income or Expense
      if (isSplitEnabled) {
        // Validate multiple splits
        for (let i = 0; i < splits.length; i++) {
          const s = splits[i];
          if (!s.categoryId) {
            errorMessage = `Category is required for split #${i + 1}`;
            return;
          }
          if (s.amountMinor <= 0) {
            errorMessage = `Amount must be positive for split #${i + 1}`;
            return;
          }
        }

        if (splitsSum !== totalAmountMinor) {
          errorMessage = `Sum of splits (${formatMinorAsEuro(splitsSum)} €) must equal the total amount (${formatMinorAsEuro(totalAmountMinor)} €)`;
          return;
        }

        finalSplits = splits.map(s => ({
          id: s.id,
          categoryId: s.categoryId,
          amountMinor: s.amountMinor,
          note: s.note.trim() || undefined
        }));
      } else {
        // Single split mode
        if (!singleCategoryId) {
          errorMessage = "Category is required";
          return;
        }
        finalSplits = [
          {
            id: editingTransaction?.payload.splits[0]?.id ?? crypto.randomUUID(),
            categoryId: singleCategoryId,
            amountMinor: totalAmountMinor
          }
        ];
      }
    }

    loading = true;
    try {
      const timestamp = new Date().toISOString();
      const id = editingTransaction?.payload.id ?? crypto.randomUUID();

      const transactionPayload: TransactionRecord = {
        schemaVersion: 1,
        id,
        date,
        type,
        accountId: accountId || undefined,
        destinationAccountId: (type === "transfer" ? destinationAccountId : undefined),
        payee: payee.trim() || undefined,
        totalAmountMinor,
        currency: "EUR",
        splits: finalSplits,
        notes: notes.trim() || undefined,
        archived,
        createdAt: editingTransaction?.payload.createdAt ?? timestamp,
        updatedAt: timestamp
      };

      await saveRecord("transaction", transactionPayload, editingTransaction?.recordId, csrfToken);
      onClose();
    } catch (err: any) {
      console.error(err);
      errorMessage = err.message || "Failed to save transaction";
    } finally {
      loading = false;
    }
  }
</script>

<div class="modal-backdrop">
  <div class="modal-card">
    <div class="modal-header">
      <h3>{editingTransaction ? "Edit Transaction" : "Add Transaction"}</h3>
      <button class="close-btn" on:click={onClose}>&times;</button>
    </div>

    {#if errorMessage}
      <div class="error-banner">
        {errorMessage}
      </div>
    {/if}

    <form on:submit|preventDefault={handleSubmit}>
      <div class="form-grid">
        <div class="form-group">
          <label for="tx-date">Date</label>
          <input type="date" id="tx-date" bind:value={date} required />
        </div>

        <div class="form-group">
          <label for="tx-type">Type</label>
          <select id="tx-type" bind:value={type}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer</option>
          </select>
        </div>
      </div>

      <div class="form-grid">
        <div class="form-group">
          <label for="tx-account">{type === 'transfer' ? 'Source Account' : 'Account (Optional)'}</label>
          <AccountSelect bind:value={accountId} id="tx-account" />
        </div>

        {#if type === 'transfer'}
          <div class="form-group">
            <label for="tx-dest-account">Destination Account</label>
            <AccountSelect bind:value={destinationAccountId} id="tx-dest-account" />
          </div>
        {:else}
          <div class="form-group">
            <label for="tx-payee">Payee / Payor</label>
            <input type="text" id="tx-payee" bind:value={payee} placeholder="e.g. Lidl, Employer" maxlength="120" />
          </div>
        {/if}
      </div>

      <div class="form-grid">
        <div class="form-group">
          <label for="tx-amount">Total Amount (€)</label>
          <MoneyInput bind:value={totalAmountMinor} id="tx-amount" placeholder="0.00" />
        </div>

        {#if type !== 'transfer'}
          <div class="form-group split-checkbox-container">
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={isSplitEnabled} />
              <span>Split category splits</span>
            </label>
          </div>
        {/if}
      </div>

      {#if type !== 'transfer'}
        {#if !isSplitEnabled}
          <div class="form-group">
            <label for="tx-category">Category</label>
            <CategorySelect bind:value={singleCategoryId} id="tx-category" />
          </div>
        {:else}
          <!-- Splits Editor -->
          <div class="splits-editor-section">
            <div class="splits-header">
              <h4>Split Categories</h4>
              <button type="button" class="add-split-btn" on:click={addSplitRow}>+ Add Category</button>
            </div>
            
            <div class="splits-list">
              {#each splits as split, idx}
                <div class="split-row">
                  <div class="split-category">
                    <CategorySelect bind:value={split.categoryId} id="split-cat-{idx}" />
                  </div>
                  <div class="split-amount">
                    <MoneyInput bind:value={split.amountMinor} id="split-amt-{idx}" placeholder="0.00" />
                  </div>
                  <div class="split-note">
                    <input type="text" bind:value={split.note} placeholder="Split note (optional)" maxlength="200" />
                  </div>
                  <button type="button" class="remove-split-btn" on:click={() => removeSplitRow(idx)} disabled={splits.length <= 1}>
                    &times;
                  </button>
                </div>
              {/each}
            </div>

            <div class="splits-footer">
              <div class="splits-status">
                <span>Sum: <strong class="numeric">{formatMinorAsEuro(splitsSum)} €</strong></span>
                {#if splitsDifference !== 0}
                  <span class="diff-tag {splitsDifference > 0 ? 'under' : 'over'}">
                    {splitsDifference > 0 ? 'Remaining:' : 'Over:'} 
                    <strong class="numeric">{formatMinorAsEuro(Math.abs(splitsDifference))} €</strong>
                  </span>
                  {#if splitsDifference > 0}
                    <button type="button" class="quick-dist-btn" on:click={distributeRemaining}>Distribute Remaining</button>
                  {/if}
                {:else}
                  <span class="diff-tag matched">Matched!</span>
                {/if}
              </div>
            </div>
          </div>
        {/if}
      {/if}

      <div class="form-group">
        <label for="tx-notes">Notes</label>
        <textarea id="tx-notes" bind:value={notes} placeholder="Optional transaction details..." rows="2"></textarea>
      </div>

      {#if editingTransaction}
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={archived} />
            <span>Archived</span>
          </label>
        </div>
      {/if}

      <div class="form-actions">
        <button type="button" class="cancel-btn" on:click={onClose}>Cancel</button>
        <button type="submit" class="save-btn" disabled={loading}>
          {loading ? "Saving..." : "Save Transaction"}
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
    max-width: 650px;
    max-height: 90vh;
    overflow-y: auto;
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
    gap: 1rem;
  }

  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .split-checkbox-container {
    justify-content: flex-end;
    padding-bottom: 0.2rem;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #c9d1d9;
    font-size: 0.9rem;
    cursor: pointer;
    user-select: none;
  }

  .checkbox-label input {
    cursor: pointer;
  }

  label {
    color: #c9d1d9;
    font-size: 0.9rem;
    font-weight: 500;
  }

  input[type="text"],
  input[type="date"],
  select,
  textarea {
    padding: 0.6rem 0.8rem;
    background-color: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #c9d1d9;
    font-family: inherit;
    font-size: 0.9rem;
    box-sizing: border-box;
    width: 100%;
  }

  input:focus,
  select:focus,
  textarea:focus {
    border-color: #58a6ff;
    outline: none;
    box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.15);
  }

  /* Splits Editor Section */
  .splits-editor-section {
    border: 1px solid #30363d;
    background-color: #0d1117;
    border-radius: 8px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .splits-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .splits-header h4 {
    margin: 0;
    color: #f0f6fc;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .add-split-btn {
    background-color: #21262d;
    border: 1px solid #30363d;
    color: #58a6ff;
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0.35rem 0.75rem;
    border-radius: 4px;
    cursor: pointer;
  }

  .add-split-btn:hover {
    background-color: #30363d;
  }

  .splits-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 200px;
    overflow-y: auto;
    padding-right: 0.25rem;
  }

  .split-row {
    display: grid;
    grid-template-columns: 2fr 1.2fr 2.5fr auto;
    gap: 0.5rem;
    align-items: center;
  }

  .remove-split-btn {
    background: none;
    border: none;
    color: #f85149;
    font-size: 1.4rem;
    cursor: pointer;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .remove-split-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .splits-footer {
    border-top: 1px solid #30363d;
    padding-top: 0.75rem;
    font-size: 0.85rem;
    color: #8b949e;
  }

  .splits-status {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    flex-wrap: wrap;
  }

  .diff-tag {
    border-radius: 4px;
    padding: 0.1rem 0.4rem;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .diff-tag.under {
    color: #d29922;
    background-color: rgba(210, 153, 34, 0.1);
  }

  .diff-tag.over {
    color: #f85149;
    background-color: rgba(248, 81, 73, 0.1);
  }

  .diff-tag.matched {
    color: #3fdb7f;
    background-color: rgba(63, 219, 127, 0.1);
  }

  .quick-dist-btn {
    background: none;
    border: none;
    color: #58a6ff;
    cursor: pointer;
    font-weight: 600;
    text-decoration: underline;
    padding: 0;
    font-size: 0.8rem;
  }

  .quick-dist-btn:hover {
    color: #79c0ff;
  }

  .numeric {
    font-family: monospace;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    border-top: 1px solid #30363d;
    padding-top: 1rem;
    margin-top: 0.5rem;
  }

  .cancel-btn {
    background-color: #21262d;
    border: 1px solid #30363d;
    color: #c9d1d9;
    padding: 0.55rem 1.2rem;
    border-radius: 6px;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .cancel-btn:hover {
    background-color: #30363d;
  }

  .save-btn {
    background-color: #238636;
    border: 1px solid #2ea043;
    color: #ffffff;
    padding: 0.55rem 1.2rem;
    border-radius: 6px;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .save-btn:hover {
    background-color: #2ea043;
  }

  .save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
