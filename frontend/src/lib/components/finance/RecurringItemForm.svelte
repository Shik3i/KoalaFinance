<script lang="ts">
  import type { RecurringItemRecord, RecurringKind, RecurringInterval, Necessity, LoadedFinanceRecord } from "../../finance/types";
  import { saveRecord, categories } from "../../finance/store";
  import MoneyInput from "./MoneyInput.svelte";
  import CategorySelect from "./CategorySelect.svelte";
  import AccountSelect from "./AccountSelect.svelte";

  export let editingItem: LoadedFinanceRecord<RecurringItemRecord> | undefined = undefined;
  export let csrfToken = "";
  export let onClose: () => void;

  let name = editingItem?.payload.name ?? "";
  let kind: RecurringKind = editingItem?.payload.kind ?? "expense";
  let amountMinor: number | undefined = editingItem?.payload.amountMinor;
  let interval: RecurringInterval = editingItem?.payload.interval ?? "monthly";
  let nextDate = editingItem?.payload.nextDate ?? "";
  let categoryId = editingItem?.payload.categoryId ?? "";
  let accountId = editingItem?.payload.accountId ?? "";
  let necessity: Necessity = editingItem?.payload.necessity ?? "essential";
  let notes = editingItem?.payload.notes ?? "";
  let active = editingItem?.payload.active ?? true;

  let errorMessage = "";
  let loading = false;

  async function handleSubmit() {
    errorMessage = "";
    if (!name.trim()) {
      errorMessage = "Name is required";
      return;
    }
    if (amountMinor === undefined) {
      errorMessage = "Amount is required and must be valid";
      return;
    }
    if (!categoryId) {
      errorMessage = "Category is required. Create a category first if none exist.";
      return;
    }

    loading = true;
    try {
      const timestamp = new Date().toISOString();
      const id = editingItem?.payload.id ?? crypto.randomUUID();

      const itemPayload: RecurringItemRecord = {
        schemaVersion: 1,
        id,
        name: name.trim(),
        kind,
        amountMinor,
        currency: "EUR",
        interval,
        nextDate: nextDate ? nextDate : undefined,
        categoryId,
        accountId: accountId || undefined,
        necessity,
        notes: notes.trim() || undefined,
        active,
        archived: editingItem?.payload.archived ?? false,
        createdAt: editingItem?.payload.createdAt ?? timestamp,
        updatedAt: timestamp
      };

      await saveRecord("recurring_item", itemPayload, editingItem?.recordId, csrfToken);
      onClose();
    } catch (err: any) {
      console.error(err);
      errorMessage = err.message || "Failed to save recurring item";
    } finally {
      loading = false;
    }
  }
</script>

<div class="modal-backdrop">
  <div class="modal-card">
    <div class="modal-header">
      <h3>{editingItem ? "Edit Recurring Item" : "Add Recurring Item"}</h3>
      <button class="close-btn" on:click={onClose}>&times;</button>
    </div>

    {#if errorMessage}
      <div class="error-banner">
        {errorMessage}
      </div>
    {/if}

    {#if $categories.length === 0}
      <div class="warning-banner">
        ⚠️ You need to have at least one Category before creating a recurring item.
      </div>
    {/if}

    <form on:submit|preventDefault={handleSubmit}>
      <div class="form-group">
        <label for="rec-name">Name</label>
        <input
          type="text"
          id="rec-name"
          bind:value={name}
          placeholder="e.g. Netflix Subscription, Monthly Salary"
          required
          maxlength="120"
        />
      </div>

      <div class="form-group-row">
        <div class="form-group">
          <label for="rec-kind">Kind</label>
          <select id="rec-kind" bind:value={kind}>
            <option value="expense">Expense (Outflow)</option>
            <option value="income">Income (Inflow)</option>
          </select>
        </div>

        <div class="form-group">
          <label for="rec-amount">Amount (EUR)</label>
          <MoneyInput
            id="rec-amount"
            bind:value={amountMinor}
            signed={false}
            placeholder="0.00"
          />
        </div>
      </div>

      <div class="form-group-row">
        <div class="form-group">
          <label for="rec-interval">Interval</label>
          <select id="rec-interval" bind:value={interval}>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>

        <div class="form-group">
          <label for="rec-date">Next Payment Date (Optional)</label>
          <input
            type="date"
            id="rec-date"
            bind:value={nextDate}
          />
        </div>
      </div>

      <div class="form-group-row">
        <div class="form-group">
          <label for="rec-cat">Category</label>
          <CategorySelect id="rec-cat" bind:value={categoryId} required={true} />
        </div>

        <div class="form-group">
          <label for="rec-acc">Linked Account (Optional)</label>
          <AccountSelect id="rec-acc" bind:value={accountId} optional={true} />
        </div>
      </div>

      <div class="form-group">
        <label for="rec-necessity">Necessity / Priority</label>
        <select id="rec-necessity" bind:value={necessity}>
          <option value="essential">Essential (Need)</option>
          <option value="useful">Useful (Comfort)</option>
          <option value="optional">Optional (Want)</option>
          <option value="cancel_candidate">Cancel Candidate (Reviewing)</option>
        </select>
      </div>

      <div class="form-group">
        <label for="rec-notes">Notes</label>
        <textarea
          id="rec-notes"
          bind:value={notes}
          placeholder="Add details, billing links, contract runtimes..."
          maxlength="2000"
          rows="3"
        ></textarea>
      </div>

      <div class="form-group checkbox-group">
        <label>
          <input type="checkbox" bind:checked={active} />
          Active (Include in monthly/yearly equivalent aggregates)
        </label>
      </div>

      <div class="form-actions">
        <button type="button" class="cancel-btn" on:click={onClose} disabled={loading}>
          Cancel
        </button>
        <button type="submit" class="submit-btn" disabled={loading || $categories.length === 0}>
          {loading ? "Saving..." : "Save Item"}
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
    max-width: 550px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    padding: 1.5rem;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
    max-height: 90vh;
    overflow-y: auto;
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

  .warning-banner {
    background-color: rgba(210, 153, 34, 0.15);
    border: 1px solid #d29922;
    color: #d29922;
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
  input[type="date"],
  select,
  textarea {
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
  input[type="date"]:focus,
  select:focus,
  textarea:focus {
    border-color: #58a6ff;
    outline: none;
  }

  textarea {
    resize: vertical;
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
