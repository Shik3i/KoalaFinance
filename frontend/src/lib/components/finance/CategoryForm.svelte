<script lang="ts">
  import { get } from "svelte/store";
  import type { CategoryRecord, CategoryKind, LoadedFinanceRecord } from "../../finance/types";
  import { saveRecord, categories } from "../../finance/store";

  export let editingCategory: LoadedFinanceRecord<CategoryRecord> | undefined = undefined;
  export let csrfToken = "";
  export let onClose: () => void;

  let name = editingCategory?.payload.name ?? "";
  let kind: CategoryKind = editingCategory?.payload.kind ?? "expense";
  let color = editingCategory?.payload.color ?? "#58a6ff";
  let icon = editingCategory?.payload.icon ?? "🏷️";
  let archived = editingCategory?.payload.archived ?? false;

  let errorMessage = "";
  let loading = false;

  async function handleSubmit() {
    errorMessage = "";
    if (!name.trim()) {
      errorMessage = "Category name is required";
      return;
    }

    // Client-side active duplicate check using LoadedFinanceRecord payload
    const isDuplicate = get(categories).some(
      (c) =>
        !c.payload.archived &&
        c.payload.kind === kind &&
        c.payload.name.trim().toLowerCase() === name.trim().toLowerCase() &&
        c.payload.id !== editingCategory?.payload.id
    );

    if (isDuplicate) {
      errorMessage = `An active category named "${name.trim()}" already exists under "${kind}"`;
      return;
    }

    loading = true;
    try {
      const timestamp = new Date().toISOString();
      const id = editingCategory?.payload.id ?? crypto.randomUUID();

      const categoryPayload: CategoryRecord = {
        schemaVersion: 1,
        id,
        name: name.trim(),
        kind,
        color: color.trim() || undefined,
        icon: icon.trim() || undefined,
        archived,
        createdAt: editingCategory?.payload.createdAt ?? timestamp,
        updatedAt: timestamp
      };

      await saveRecord("category", categoryPayload, editingCategory?.recordId, csrfToken);
      onClose();
    } catch (err: any) {
      console.error(err);
      errorMessage = err.message || "Failed to save category";
    } finally {
      loading = false;
    }
  }
</script>

<div class="modal-backdrop">
  <div class="modal-card">
    <div class="modal-header">
      <h3>{editingCategory ? "Edit Category" : "Add Category"}</h3>
      <button class="close-btn" on:click={onClose}>&times;</button>
    </div>

    {#if errorMessage}
      <div class="error-banner">
        {errorMessage}
      </div>
    {/if}

    <form on:submit|preventDefault={handleSubmit}>
      <div class="form-group">
        <label for="cat-name">Category Name</label>
        <input
          type="text"
          id="cat-name"
          bind:value={name}
          placeholder="e.g. Groceries"
          required
          maxlength="120"
        />
      </div>

      <div class="form-group-row">
        <div class="form-group">
          <label for="cat-kind">Kind</label>
          <select id="cat-kind" bind:value={kind}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer</option>
            <option value="mixed">Mixed</option>
          </select>
        </div>

        <div class="form-group">
          <label for="cat-icon">Icon (Emoji)</label>
          <input
            type="text"
            id="cat-icon"
            bind:value={icon}
            placeholder="🏷️"
            maxlength="10"
          />
        </div>
      </div>

      <div class="form-group">
        <label for="cat-color">Color (Hex/CSS)</label>
        <div class="color-picker-wrapper">
          <input
            type="color"
            id="cat-color-picker"
            bind:value={color}
          />
          <input
            type="text"
            id="cat-color"
            bind:value={color}
            placeholder="#58a6ff"
            required
            maxlength="30"
          />
        </div>
      </div>

      {#if editingCategory}
        <div class="form-group checkbox-group">
          <label>
            <input type="checkbox" bind:checked={archived} />
            Archive this category (hides it from active selectors)
          </label>
        </div>
      {/if}

      <div class="form-actions">
        <button type="button" class="cancel-btn" on:click={onClose} disabled={loading}>
          Cancel
        </button>
        <button type="submit" class="submit-btn" disabled={loading}>
          {loading ? "Saving..." : "Save Category"}
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
    max-width: 450px;
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
    grid-template-columns: 1.5fr 1fr;
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

  .color-picker-wrapper {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  input[type="color"] {
    background: none;
    border: 1px solid #30363d;
    border-radius: 4px;
    padding: 0;
    width: 40px;
    height: 38px;
    cursor: pointer;
    box-sizing: border-box;
  }

  .color-picker-wrapper input[type="text"] {
    flex-grow: 1;
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
