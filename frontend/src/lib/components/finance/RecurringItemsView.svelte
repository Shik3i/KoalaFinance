<script lang="ts">
  import { recurringItems, categories, accounts, loading, error, warning, refreshRecords, archiveRecord } from "../../finance/store";
  import { formatMinorAsEuro } from "../../finance/money";
  import { monthlyEquivalentMinor, yearlyEquivalentMinor } from "../../finance/calculations";
  import type { RecurringItemRecord, LoadedFinanceRecord } from "../../finance/types";
  import RecurringItemForm from "./RecurringItemForm.svelte";

  export let csrfToken = "";

  let showForm = false;
  let editingItem: LoadedFinanceRecord<RecurringItemRecord> | undefined = undefined;
  let filterKind: "all" | "income" | "expense" = "all";
  let showArchived = false;

  $: activeItems = $recurringItems.filter((i) => !i.payload.archived);
  
  $: filteredItems = (showArchived ? $recurringItems : activeItems).filter((i) => {
    if (filterKind === "all") return true;
    return i.payload.kind === filterKind;
  });

  function getCategoryName(catId: string): string {
    const cat = $categories.find((c) => c.payload.id === catId);
    return cat ? `${cat.payload.icon || ""} ${cat.payload.name}` : "Unknown Category";
  }

  function getAccountName(accId: string | undefined): string {
    if (!accId) return "—";
    const acc = $accounts.find((a) => a.payload.id === accId);
    return acc ? acc.payload.name : "Unknown Account";
  }

  function handleEdit(item: LoadedFinanceRecord<RecurringItemRecord>) {
    editingItem = item;
    showForm = true;
  }

  function handleAdd() {
    editingItem = undefined;
    showForm = true;
  }

  async function handleArchive(item: LoadedFinanceRecord<RecurringItemRecord>) {
    if (confirm(`Are you sure you want to archive "${item.payload.name}"?`)) {
      try {
        await archiveRecord("recurring_item", item.payload, item.recordId, csrfToken);
      } catch (err: any) {
        alert(err.message || "Failed to archive item");
      }
    }
  }

  async function handleUnarchive(item: LoadedFinanceRecord<RecurringItemRecord>) {
    try {
      const updated = { ...item.payload, archived: false, updatedAt: new Date().toISOString() };
      await archiveRecord("recurring_item", updated, item.recordId, csrfToken);
    } catch (err: any) {
      alert(err.message || "Failed to unarchive item");
    }
  }

  async function handleToggleActive(item: LoadedFinanceRecord<RecurringItemRecord>) {
    try {
      const updated = { ...item.payload, active: !item.payload.active, updatedAt: new Date().toISOString() };
      await archiveRecord("recurring_item", updated, item.recordId, csrfToken);
    } catch (err: any) {
      alert(err.message || "Failed to update item status");
    }
  }
</script>

<div class="view-container">
  <div class="view-header">
    <div>
      <h2>🔄 Recurring Transactions</h2>
      <p class="view-desc">Track and analyze contract costs, subscriptions, rent, and monthly/yearly salary incomes.</p>
    </div>
    <div class="header-actions">
      <select class="filter-select" bind:value={filterKind}>
        <option value="all">All Inflow/Outflow</option>
        <option value="expense">Expenses Only</option>
        <option value="income">Incomes Only</option>
      </select>
      <button class="toggle-archived-btn" on:click={() => (showArchived = !showArchived)}>
        {showArchived ? "Hide Archived" : "Show Archived ({archivedItems.length})"}
      </button>
      <button class="add-btn" on:click={handleAdd} disabled={$categories.length === 0}>
        + Add Recurring Item
      </button>
    </div>
  </div>

  {#if $error}
    <div class="banner error-banner">
      <strong>Error:</strong> {$error}
      <button class="reload-btn" on:click={refreshRecords}>Reload</button>
    </div>
  {/if}

  {#if $warning}
    <div class="banner warning-banner">
      <strong>Warning:</strong> {$warning}
    </div>
  {/if}

  {#if $categories.length === 0}
    <div class="banner warning-banner">
      ⚠️ Seeding categories is required before managing recurring items. Select or create a vault to initialize default categories.
    </div>
  {/if}

  {#if $loading}
    <div class="loading-state">
      <span class="spinner"></span>
      <p>Loading decrypted recurring items...</p>
    </div>
  {:else if filteredItems.length === 0}
    <div class="empty-state">
      <span class="icon">🔄</span>
      <h3>No recurring items found</h3>
      <p>Add fixed recurring events (like subscriptions, rent, or salaries) to generate calculations.</p>
      <button class="add-btn" on:click={handleAdd} disabled={$categories.length === 0}>+ Add Recurring Item</button>
    </div>
  {:else}
    <div class="table-container">
      <table class="finance-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Kind</th>
            <th>Amount</th>
            <th>Interval</th>
            <th>Category</th>
            <th>Account</th>
            <th>Necessity</th>
            <th>Active</th>
            <th class="amount-col">Monthly Equiv.</th>
            <th class="amount-col">Yearly Equiv.</th>
            <th class="actions-col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredItems as item}
            <tr class="{item.payload.archived ? 'archived-row' : ''} {!item.payload.active ? 'inactive-row' : ''}">
              <td class="name-cell">
                <strong>{item.payload.name}</strong>
                {#if item.payload.notes}
                  <span class="note-tooltip" title={item.payload.notes}>📝</span>
                {/if}
                {#if item.payload.nextDate}
                  <div class="next-date-label">Next: {item.payload.nextDate}</div>
                {/if}
              </td>
              <td>
                <span class="badge kind-badge {item.payload.kind}">{item.payload.kind}</span>
              </td>
              <td class="numeric">
                {formatMinorAsEuro(item.payload.amountMinor)} €
              </td>
              <td>
                <span class="interval-text">{item.payload.interval}</span>
              </td>
              <td>
                {getCategoryName(item.payload.categoryId)}
              </td>
              <td>
                {getAccountName(item.payload.accountId)}
              </td>
              <td>
                <span class="badge necessity-badge {item.payload.necessity}">{item.payload.necessity.replace('_', ' ')}</span>
              </td>
              <td>
                <button class="status-toggle-btn {item.payload.active ? 'active' : 'inactive'}" on:click={() => handleToggleActive(item)} disabled={item.payload.archived}>
                  {item.payload.active ? "Active" : "Paused"}
                </button>
              </td>
              <td class="amount-col numeric">
                {item.payload.active ? formatMinorAsEuro(monthlyEquivalentMinor(item.payload)) : "0.00"} €
              </td>
              <td class="amount-col numeric">
                {item.payload.active ? formatMinorAsEuro(yearlyEquivalentMinor(item.payload)) : "0.00"} €
              </td>
              <td class="actions-col">
                <button class="action-btn edit-btn" on:click={() => handleEdit(item)}>Edit</button>
                {#if item.payload.archived}
                  <button class="action-btn unarchive-btn" on:click={() => handleUnarchive(item)}>Unarchive</button>
                {:else}
                  <button class="action-btn archive-btn" on:click={() => handleArchive(item)}>Archive</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if showForm}
    <RecurringItemForm
      editingItem={editingItem}
      {csrfToken}
      onClose={() => {
        showForm = false;
        editingItem = undefined;
      }}
    />
  {/if}
</div>

<style>
  .view-container {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1.5rem;
    box-sizing: border-box;
  }

  .view-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #30363d;
    padding-bottom: 1rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .view-header h2 {
    margin: 0;
    color: #f0f6fc;
    font-size: 1.5rem;
  }

  .view-desc {
    margin: 0.3rem 0 0 0;
    color: #8b949e;
    font-size: 0.9rem;
  }

  .header-actions {
    display: flex;
    gap: 0.8rem;
    align-items: center;
  }

  .filter-select {
    padding: 0.5rem 0.8rem;
    background-color: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #c9d1d9;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .toggle-archived-btn {
    background: none;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #8b949e;
    padding: 0.5rem 0.9rem;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 500;
  }

  .toggle-archived-btn:hover {
    border-color: #8b949e;
    color: #c9d1d9;
  }

  .add-btn {
    background-color: #238636;
    border: 1px solid #2ea043;
    border-radius: 6px;
    color: #ffffff;
    padding: 0.5rem 1rem;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .add-btn:hover:not(:disabled) {
    background-color: #2ea043;
  }

  .banner {
    border-radius: 6px;
    padding: 0.8rem 1rem;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .error-banner {
    background-color: rgba(248, 81, 73, 0.1);
    border: 1px solid #f85149;
    color: #ff7b72;
  }

  .warning-banner {
    background-color: rgba(210, 153, 34, 0.1);
    border: 1px solid #d29922;
    color: #d29922;
  }

  .reload-btn {
    background-color: #21262d;
    border: 1px solid #30363d;
    color: #c9d1d9;
    border-radius: 4px;
    padding: 0.3rem 0.6rem;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .reload-btn:hover {
    background-color: #30363d;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    gap: 1rem;
    color: #8b949e;
  }

  .spinner {
    width: 28px;
    height: 28px;
    border: 3px solid rgba(88, 166, 255, 0.2);
    border-top-color: #58a6ff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    background-color: #161b22;
    border: 1px dashed #30363d;
    border-radius: 12px;
    text-align: center;
    gap: 0.8rem;
  }

  .empty-state .icon {
    font-size: 3rem;
  }

  .empty-state h3 {
    margin: 0;
    color: #f0f6fc;
    font-size: 1.25rem;
  }

  .empty-state p {
    margin: 0 0 0.8rem 0;
    color: #8b949e;
    font-size: 0.95rem;
    max-width: 360px;
  }

  .table-container {
    background-color: #161b22;
    border: 1px solid #30363d;
    border-radius: 12px;
    overflow: hidden;
  }

  .finance-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    font-size: 0.9rem;
  }

  .finance-table th {
    background-color: #0d1117;
    border-bottom: 1px solid #30363d;
    color: #8b949e;
    font-weight: 600;
    padding: 0.8rem 1rem;
  }

  .finance-table td {
    border-bottom: 1px solid #21262d;
    padding: 0.8rem 1rem;
    color: #c9d1d9;
    vertical-align: middle;
  }

  .finance-table tbody tr:hover {
    background-color: rgba(33, 38, 45, 0.3);
  }

  .archived-row {
    background-color: rgba(22, 27, 34, 0.5);
    opacity: 0.6;
  }

  .inactive-row td {
    color: #8b949e;
  }

  .name-cell strong {
    color: #f0f6fc;
    margin-right: 0.4rem;
  }

  .inactive-row .name-cell strong {
    color: #8b949e;
  }

  .note-tooltip {
    cursor: help;
    font-size: 0.9rem;
  }

  .next-date-label {
    font-size: 0.75rem;
    color: #8b949e;
    margin-top: 0.15rem;
  }

  .amount-col {
    text-align: right;
  }

  .numeric {
    font-family: monospace;
    font-size: 0.95rem;
  }

  .interval-text {
    text-transform: capitalize;
    color: #c9d1d9;
  }

  .badge {
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.1/rem 0.4rem;
    display: inline-block;
    text-transform: capitalize;
  }

  .kind-badge.expense { color: #ff7b72; background-color: rgba(248, 81, 73, 0.1); border: 1px solid rgba(248, 81, 73, 0.2); }
  .kind-badge.income { color: #39d353; background-color: rgba(38, 166, 65, 0.1); border: 1px solid rgba(38, 166, 65, 0.2); }

  .necessity-badge.essential { color: #ff7b72; background-color: rgba(248, 81, 73, 0.15); }
  .necessity-badge.useful { color: #d29922; background-color: rgba(210, 153, 34, 0.15); }
  .necessity-badge.optional { color: #58a6ff; background-color: rgba(56, 139, 253, 0.15); }
  .necessity-badge.cancel_candidate { color: #ff7b72; border: 1px dashed #ff7b72; background-color: transparent; }

  .status-toggle-btn {
    border: 1px solid #30363d;
    border-radius: 4px;
    padding: 0.2rem 0.5rem;
    font-size: 0.75rem;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.15s ease;
  }

  .status-toggle-btn.active {
    background-color: rgba(46, 160, 67, 0.1);
    color: #39d353;
    border-color: rgba(46, 160, 67, 0.4);
  }

  .status-toggle-btn.active:hover {
    background-color: rgba(46, 160, 67, 0.2);
  }

  .status-toggle-btn.inactive {
    background-color: rgba(248, 81, 73, 0.05);
    color: #f85149;
    border-color: rgba(248, 81, 73, 0.3);
  }

  .status-toggle-btn.inactive:hover {
    background-color: rgba(248, 81, 73, 0.15);
  }

  .actions-col {
    text-align: right;
    width: 160px;
  }

  .action-btn {
    background: none;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #c9d1d9;
    padding: 0.3rem 0.6rem;
    font-size: 0.8rem;
    cursor: pointer;
    font-weight: 500;
  }

  .action-btn:hover {
    background-color: #21262d;
    border-color: #8b949e;
  }

  .archive-btn {
    border-color: rgba(248, 81, 73, 0.3);
    color: #ff7b72;
  }

  .archive-btn:hover {
    background-color: rgba(248, 81, 73, 0.15);
    border-color: #f85149;
  }

  .unarchive-btn {
    border-color: rgba(57, 211, 83, 0.3);
    color: #39d353;
  }

  .unarchive-btn:hover {
    background-color: rgba(57, 211, 83, 0.15);
    border-color: #39d353;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
