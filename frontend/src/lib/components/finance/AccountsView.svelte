<script lang="ts">
  import { derivedAccounts, loading, error, warning, refreshRecords, archiveRecord } from "../../finance/store";
  import { formatMinorAsEuro } from "../../finance/money";
  import type { AccountRecord, LoadedFinanceRecord } from "../../finance/types";
  import AccountForm from "./AccountForm.svelte";

  export let csrfToken = "";

  let showForm = false;
  let editingAccount: LoadedFinanceRecord<AccountRecord> | undefined = undefined;
  let showArchived = false;

  $: activeAccounts = $derivedAccounts.filter((a) => !a.payload.archived);
  $: archivedAccounts = $derivedAccounts.filter((a) => a.payload.archived);
  $: visibleAccounts = showArchived ? $derivedAccounts : activeAccounts;
  $: toggleBtnLabel = showArchived ? "Hide Archived" : `Show Archived (${archivedAccounts.length})`;

  function handleEdit(acc: LoadedFinanceRecord<AccountRecord>) {
    editingAccount = acc;
    showForm = true;
  }

  function handleAdd() {
    editingAccount = undefined;
    showForm = true;
  }

  async function handleArchive(acc: LoadedFinanceRecord<AccountRecord>) {
    if (confirm(`Are you sure you want to archive "${acc.payload.name}"?`)) {
      try {
        await archiveRecord("account", acc.payload, acc.recordId, csrfToken);
      } catch (err: any) {
        alert(err.message || "Failed to archive account");
      }
    }
  }

  async function handleUnarchive(acc: LoadedFinanceRecord<AccountRecord>) {
    try {
      const updated = { ...acc.payload, archived: false, updatedAt: new Date().toISOString() };
      await archiveRecord("account", updated, acc.recordId, csrfToken);
    } catch (err: any) {
      alert(err.message || "Failed to unarchive account");
    }
  }
</script>

<div class="view-container">
  <div class="view-header">
    <div>
      <h2>🏦 Accounts Management</h2>
      <p class="view-desc">Add, edit, or archive checking, savings, Paypal, cash, or credit card accounts.</p>
    </div>
    <div class="header-actions">
      <button class="toggle-archived-btn" on:click={() => (showArchived = !showArchived)}>
        {toggleBtnLabel}
      </button>
      <button class="add-btn" on:click={handleAdd}>
        + Add Account
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

  {#if $loading}
    <div class="loading-state">
      <span class="spinner"></span>
      <p>Loading decrypted accounts...</p>
    </div>
  {:else if visibleAccounts.length === 0}
    <div class="empty-state">
      <span class="icon">💳</span>
      <h3>No accounts found</h3>
      <p>Create your first account to start tracking your balances.</p>
      <button class="add-btn" on:click={handleAdd}>+ Add Account</button>
    </div>
  {:else}
    <div class="table-container">
      <table class="finance-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Balance Mode</th>
            <th class="amount-col">Opening Balance</th>
            <th class="amount-col">Current Balance</th>
            <th>Status</th>
            <th class="actions-col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each visibleAccounts as acc}
            <tr class={acc.payload.archived ? "archived-row" : ""}>
              <td class="name-cell">
                <strong>{acc.payload.name}</strong>
              </td>
              <td>
                <span class="badge type-badge {acc.payload.type}">{acc.payload.type.replace('_', ' ')}</span>
              </td>
              <td>
                <span class="badge mode-badge {acc.payload.balanceMode}">{acc.payload.balanceMode}</span>
              </td>
              <td class="amount-col numeric">
                {formatMinorAsEuro(acc.payload.openingBalanceMinor ?? 0)} €
              </td>
              <td class="amount-col numeric">
                {#if acc.payload.balanceMode === "manual"}
                  <span class="amount-value {(acc.payload.currentBalanceMinor ?? 0) < 0 ? 'negative' : ''}">
                    {formatMinorAsEuro(acc.payload.currentBalanceMinor ?? 0)} €
                  </span>
                {:else if acc.payload.balanceMode === "calculated"}
                  <span class="amount-value {(acc.payload.currentBalanceMinor ?? 0) < 0 ? 'negative' : ''}" title="Calculated in-memory from transactions">
                    {formatMinorAsEuro(acc.payload.currentBalanceMinor ?? 0)} €
                    <span class="calc-badge" style="font-size: 0.75rem; color: #8b949e; margin-left: 0.2rem;">(calc)</span>
                  </span>
                {:else}
                  <span class="none-placeholder">None</span>
                {/if}
              </td>
              <td>
                {#if acc.payload.archived}
                  <span class="status-badge archived">Archived</span>
                {:else}
                  <span class="status-badge active">Active</span>
                {/if}
              </td>
              <td class="actions-col">
                <button class="action-btn edit-btn" on:click={() => handleEdit(acc)}>Edit</button>
                {#if acc.payload.archived}
                  <button class="action-btn unarchive-btn" on:click={() => handleUnarchive(acc)}>Unarchive</button>
                {:else}
                  <button class="action-btn archive-btn" on:click={() => handleArchive(acc)}>Archive</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if showForm}
    <AccountForm
      editingAccount={editingAccount}
      {csrfToken}
      onClose={() => {
        showForm = false;
        editingAccount = undefined;
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

  .add-btn:hover {
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
    overflow-x: auto;
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
  }

  .archived-row td {
    color: #8b949e;
  }

  .name-cell strong {
    color: #f0f6fc;
  }

  .archived-row .name-cell strong {
    color: #8b949e;
  }

  .amount-col {
    text-align: right;
  }

  .numeric {
    font-family: monospace;
    font-size: 0.95rem;
  }

  .amount-value.negative {
    color: #ff7b72;
  }

  .calculated-placeholder,
  .none-placeholder {
    color: #8b949e;
    font-size: 0.8rem;
    font-style: italic;
  }

  .badge {
    border-radius: 2em;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.15rem 0.5rem;
    display: inline-block;
    text-transform: capitalize;
  }

  .type-badge {
    background-color: #21262d;
    border: 1px solid #30363d;
    color: #c9d1d9;
  }

  .type-badge.checking { color: #58a6ff; border-color: rgba(56, 139, 253, 0.4); background-color: rgba(56, 139, 253, 0.1); }
  .type-badge.savings { color: #39d353; border-color: rgba(38, 166, 65, 0.4); background-color: rgba(38, 166, 65, 0.1); }
  .type-badge.credit_card { color: #ff7b72; border-color: rgba(248, 81, 73, 0.4); background-color: rgba(248, 81, 73, 0.1); }
  .type-badge.paypal { color: #da70d6; border-color: rgba(218, 112, 214, 0.4); background-color: rgba(218, 112, 214, 0.1); }

  .mode-badge {
    background-color: #21262d;
    border: 1px dashed #30363d;
    color: #8b949e;
  }
  .mode-badge.manual { color: #d29922; border-color: rgba(210, 153, 34, 0.4); background-color: rgba(210, 153, 34, 0.05); }

  .status-badge {
    font-size: 0.75rem;
    font-weight: 500;
  }

  .status-badge.active { color: #39d353; }
  .status-badge.archived { color: #8b949e; }

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
</style>
