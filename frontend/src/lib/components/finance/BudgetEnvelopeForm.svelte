<script lang="ts">
  import type { BudgetEnvelopeRecord, LoadedFinanceRecord } from "../../finance/types";
  import { saveRecord, categories, budgets } from "../../finance/store";
  import MoneyInput from "./MoneyInput.svelte";

  export let editingBudget: LoadedFinanceRecord<BudgetEnvelopeRecord> | undefined = undefined;
  export let csrfToken = "";
  export let onClose: () => void;
  export let defaultMonth = new Date().toISOString().substring(0, 7); // Default to YYYY-MM
  export let defaultCategoryId = "";

  let month = editingBudget?.payload.month ?? defaultMonth;
  let categoryId = editingBudget?.payload.categoryId ?? defaultCategoryId;
  let plannedAmountMinor = editingBudget?.payload.plannedAmountMinor ?? 0;
  let rolloverEnabled = editingBudget?.payload.rolloverEnabled ?? false;
  let note = editingBudget?.payload.note ?? "";
  let archived = editingBudget?.payload.archived ?? false;

  let errorMessage = "";
  let loading = false;

  // Filter only active expense and mixed categories for budget planning
  $: activeCategories = $categories.filter(
    (c) => !c.payload.archived && (c.payload.kind === "expense" || c.payload.kind === "mixed")
  );

  async function handleSubmit() {
    errorMessage = "";

    if (!month) {
      errorMessage = "Budget month is required";
      return;
    }

    if (!categoryId) {
      errorMessage = "Category selection is required";
      return;
    }

    if (plannedAmountMinor < 0) {
      errorMessage = "Planned budget amount cannot be negative";
      return;
    }

    // Client-side duplicate check: one active envelope per month + categoryId
    const isDuplicate = $budgets.some(
      (b) =>
        !b.payload.archived &&
        b.payload.month === month &&
        b.payload.categoryId === categoryId &&
        b.payload.id !== editingBudget?.payload.id
    );

    if (isDuplicate) {
      errorMessage = "An active budget envelope already exists for this category and month.";
      return;
    }

    loading = true;
    try {
      const timestamp = new Date().toISOString();
      const id = editingBudget?.payload.id ?? crypto.randomUUID();

      const budgetPayload: BudgetEnvelopeRecord = {
        schemaVersion: 1,
        id,
        month,
        categoryId,
        plannedAmountMinor,
        rolloverEnabled,
        note: note.trim() || undefined,
        archived,
        createdAt: editingBudget?.payload.createdAt ?? timestamp,
        updatedAt: timestamp
      };

      await saveRecord("budget", budgetPayload, editingBudget?.recordId, csrfToken);
      onClose();
    } catch (err: any) {
      console.error(err);
      errorMessage = err.message || "Failed to save budget envelope";
    } finally {
      loading = false;
    }
  }
</script>

<div class="modal-backdrop">
  <div class="modal-card">
    <div class="modal-header">
      <h3>{editingBudget ? "Edit Budget Envelope" : "Create Budget Envelope"}</h3>
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
          <label for="budget-month">Budget Month</label>
          <input type="month" id="budget-month" bind:value={month} required />
        </div>

        <div class="form-group">
          <label for="budget-category">Category</label>
          <select id="budget-category" bind:value={categoryId} required>
            <option value="" disabled selected>Select category...</option>
            {#each activeCategories as cat}
              <option value={cat.payload.id}>
                {cat.payload.icon || "🏷️"} {cat.payload.name} ({cat.payload.kind})
              </option>
            {/each}
          </select>
        </div>
      </div>

      <div class="form-grid">
        <div class="form-group">
          <label for="budget-planned">Planned Amount (€)</label>
          <MoneyInput bind:value={plannedAmountMinor} id="budget-planned" placeholder="0.00" />
        </div>

        <div class="form-group rollover-checkbox-container">
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={rolloverEnabled} />
            <span>Enable Rollover (Surplus carries over to next month)</span>
          </label>
        </div>
      </div>

      <div class="form-group">
        <label for="budget-note">Note</label>
        <textarea id="budget-note" bind:value={note} placeholder="Optional envelope description..." rows="2" maxlength="2000"></textarea>
      </div>

      {#if editingBudget}
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
          {loading ? "Saving..." : "Save Envelope"}
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
    max-width: 600px;
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

  .rollover-checkbox-container {
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

  input[type="month"],
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
