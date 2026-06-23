<script lang="ts">
  import { transactions, categories, derivedAccounts, loading, error, warning, refreshRecords, archiveRecord } from "../../finance/store";
  import { formatMinorAsEuro } from "../../finance/money";
  import type { TransactionRecord, LoadedFinanceRecord } from "../../finance/types";
  import TransactionForm from "./TransactionForm.svelte";

  export let csrfToken = "";

  let showForm = false;
  let editingTransaction: LoadedFinanceRecord<TransactionRecord> | undefined = undefined;

  // Filter state
  let selectedMonth = "all";
  let selectedAccountId = "all";
  let selectedCategoryId = "all";
  let selectedType = "all";
  let showArchived = false;

  // Derive unique months from transaction dates (YYYY-MM format)
  $: monthsList = Array.from(
    new Set(
      $transactions
        .filter(t => t.payload.date)
        .map(t => t.payload.date.substring(0, 7))
    )
  ).sort((a, b) => b.localeCompare(a)); // Descending order (newest first)

  // Filter logic
  $: filteredTransactions = $transactions.filter(tx => {
    // 1. Archive filter
    if (!showArchived && tx.payload.archived) return false;

    // 2. Month filter
    if (selectedMonth !== "all" && tx.payload.date.substring(0, 7) !== selectedMonth) {
      return false;
    }

    // 3. Account filter (matches source account or destination account for transfers)
    if (selectedAccountId !== "all") {
      const matchesSource = tx.payload.accountId === selectedAccountId;
      const matchesDest = tx.payload.type === "transfer" && tx.payload.destinationAccountId === selectedAccountId;
      if (!matchesSource && !matchesDest) return false;
    }

    // 4. Category filter
    if (selectedCategoryId !== "all") {
      if (tx.payload.type === "transfer") {
        return false; // Transfers do not have categories/splits
      }
      const matchesCategory = tx.payload.splits.some(s => s.categoryId === selectedCategoryId);
      if (!matchesCategory) return false;
    }

    // 5. Type filter
    if (selectedType !== "all" && tx.payload.type !== selectedType) {
      return false;
    }

    return true;
  }).sort((a, b) => b.payload.date.localeCompare(a.payload.date) || b.payload.createdAt.localeCompare(a.payload.createdAt));

  // Compute stats based on active filtered transactions
  // Exclude transfers from income/expense calculations to avoid inflating flow
  $: activeTxs = filteredTransactions.filter(t => !t.payload.archived);
  $: totalIncomeMinor = activeTxs
    .filter(t => t.payload.type === "income")
    .reduce((sum, t) => sum + t.payload.totalAmountMinor, 0);

  $: totalExpenseMinor = activeTxs
    .filter(t => t.payload.type === "expense")
    .reduce((sum, t) => sum + t.payload.totalAmountMinor, 0);

  $: netFlowMinor = totalIncomeMinor - totalExpenseMinor;

  // Helpers
  function getAccountName(id: string | undefined = undefined): string {
    if (!id) return "—";
    const acc = $derivedAccounts.find(a => a.payload.id === id);
    return acc ? acc.payload.name : "Unknown Account";
  }

  function getCategoryName(id: string | undefined = undefined): string {
    if (!id) return "Uncategorized";
    const cat = $categories.find(c => c.payload.id === id);
    return cat ? cat.payload.name : "Unknown Category";
  }

  function handleEdit(tx: LoadedFinanceRecord<TransactionRecord>) {
    editingTransaction = tx;
    showForm = true;
  }

  function handleAdd() {
    editingTransaction = undefined;
    showForm = true;
  }

  async function handleArchive(tx: LoadedFinanceRecord<TransactionRecord>) {
    if (confirm("Are you sure you want to archive this transaction?")) {
      try {
        await archiveRecord("transaction", tx.payload, tx.recordId, csrfToken);
      } catch (err: any) {
        alert(err.message || "Failed to archive transaction");
      }
    }
  }

  async function handleUnarchive(tx: LoadedFinanceRecord<TransactionRecord>) {
    try {
      const updated = {
        ...tx.payload,
        archived: false,
        updatedAt: new Date().toISOString()
      };
      await archiveRecord("transaction", updated, tx.recordId, csrfToken);
    } catch (err: any) {
      alert(err.message || "Failed to unarchive transaction");
    }
  }

  function resetFilters() {
    selectedMonth = "all";
    selectedAccountId = "all";
    selectedCategoryId = "all";
    selectedType = "all";
  }
</script>

<div class="view-container">
  <div class="view-header">
    <div>
      <h2>📝 Encrypted Transaction Ledger</h2>
      <p class="view-desc">Review, create, and manage your income, expenses, and account transfers securely.</p>
    </div>
    <div class="header-actions">
      <button class="toggle-archived-btn" on:click={() => (showArchived = !showArchived)}>
        {showArchived ? "Hide Archived" : "Show Archived"}
      </button>
      <button class="add-btn" on:click={handleAdd}>
        + Add Transaction
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

  <!-- Stats Grid -->
  <div class="stats-grid">
    <div class="stat-card income">
      <span class="label">Total Income (Filtered)</span>
      <span class="value numeric">+{formatMinorAsEuro(totalIncomeMinor)} €</span>
      <span class="subtext">Excludes transfers</span>
    </div>
    <div class="stat-card expense">
      <span class="label">Total Expenses (Filtered)</span>
      <span class="value numeric">-{formatMinorAsEuro(totalExpenseMinor)} €</span>
      <span class="subtext">Excludes transfers</span>
    </div>
    <div class="stat-card net-flow {netFlowMinor >= 0 ? 'positive' : 'negative'}">
      <span class="label">Net Flow (Filtered)</span>
      <span class="value numeric">
        {netFlowMinor >= 0 ? '+' : ''}{formatMinorAsEuro(netFlowMinor)} €
      </span>
      <span class="subtext">Inflow vs Outflow</span>
    </div>
  </div>

  <!-- Filters Block -->
  <div class="filters-card">
    <div class="filters-grid">
      <div class="filter-group">
        <label for="filter-month">Month</label>
        <select id="filter-month" bind:value={selectedMonth}>
          <option value="all">All Months</option>
          {#each monthsList as m}
            <option value={m}>{m}</option>
          {/each}
        </select>
      </div>

      <div class="filter-group">
        <label for="filter-account">Account</label>
        <select id="filter-account" bind:value={selectedAccountId}>
          <option value="all">All Accounts</option>
          {#each $derivedAccounts as acc}
            <option value={acc.payload.id}>{acc.payload.name}</option>
          {/each}
        </select>
      </div>

      <div class="filter-group">
        <label for="filter-category">Category</label>
        <select id="filter-category" bind:value={selectedCategoryId}>
          <option value="all">All Categories</option>
          {#each $categories as cat}
            <option value={cat.payload.id}>{cat.payload.name}</option>
          {/each}
        </select>
      </div>

      <div class="filter-group">
        <label for="filter-type">Type</label>
        <select id="filter-type" bind:value={selectedType}>
          <option value="all">All Types</option>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="transfer">Transfer</option>
        </select>
      </div>
    </div>

    {#if selectedMonth !== 'all' || selectedAccountId !== 'all' || selectedCategoryId !== 'all' || selectedType !== 'all'}
      <div class="filters-footer">
        <button class="clear-filters-btn" on:click={resetFilters}>Clear Filters</button>
      </div>
    {/if}
  </div>

  <!-- Main Table / Ledger List -->
  {#if $loading}
    <div class="loading-state">
      <span class="spinner"></span>
      <p>Loading decrypted ledger...</p>
    </div>
  {:else if filteredTransactions.length === 0}
    <div class="empty-state">
      <span class="icon">📝</span>
      <h3>No transactions found</h3>
      <p>Try adjusting your filters or record a new transaction.</p>
      <button class="add-btn" on:click={handleAdd}>+ Add Transaction</button>
    </div>
  {:else}
    <div class="table-container">
      <table class="finance-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Account(s)</th>
            <th>Payee / Payor</th>
            <th>Category / Splits</th>
            <th class="amount-col">Amount</th>
            <th>Status</th>
            <th class="actions-col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredTransactions as tx}
            <tr class="{tx.payload.archived ? 'archived-row' : ''}">
              <td class="date-cell numeric">{tx.payload.date}</td>
              <td>
                <span class="badge type-badge {tx.payload.type}">{tx.payload.type}</span>
              </td>
              <td>
                {#if tx.payload.type === "transfer"}
                  <div class="transfer-accounts">
                    <span class="src-acc" title="Source Account">{getAccountName(tx.payload.accountId)}</span>
                    <span class="arrow">➔</span>
                    <span class="dest-acc" title="Destination Account">{getAccountName(tx.payload.destinationAccountId)}</span>
                  </div>
                {:else}
                  <span>{getAccountName(tx.payload.accountId)}</span>
                {/if}
              </td>
              <td>
                <span class="payee-text" title={tx.payload.payee}>{tx.payload.payee ?? "—"}</span>
              </td>
              <td>
                {#if tx.payload.type === "transfer"}
                  <span class="transfer-placeholder">Transfer (No split)</span>
                {:else if tx.payload.splits.length === 1}
                  <span>{getCategoryName(tx.payload.splits[0].categoryId)}</span>
                {:else if tx.payload.splits.length > 1}
                  <details class="splits-disclosure">
                    <summary class="splits-summary">
                      Split ({tx.payload.splits.length} categories)
                    </summary>
                    <div class="splits-dropdown">
                      {#each tx.payload.splits as s}
                        <div class="split-detail-row">
                          <span class="split-cat-name">{getCategoryName(s.categoryId)}</span>
                          <span class="split-amt numeric">{formatMinorAsEuro(s.amountMinor)} €</span>
                          {#if s.note}
                            <span class="split-note" title={s.note}>({s.note})</span>
                          {/if}
                        </div>
                      {/each}
                    </div>
                  </details>
                {:else}
                  <span class="error-text">No split data</span>
                {/if}
              </td>
              <td class="amount-col numeric">
                <span class="amount-value {tx.payload.type} {tx.payload.type === 'expense' ? 'negative' : tx.payload.type === 'income' ? 'positive' : ''}">
                  {tx.payload.type === "expense" ? "-" : tx.payload.type === "income" ? "+" : ""}{formatMinorAsEuro(tx.payload.totalAmountMinor)} €
                </span>
              </td>
              <td>
                {#if tx.payload.archived}
                  <span class="status-badge archived">Archived</span>
                {:else}
                  <span class="status-badge active">Active</span>
                {/if}
              </td>
              <td class="actions-col">
                <button class="action-btn edit-btn" on:click={() => handleEdit(tx)}>Edit</button>
                {#if tx.payload.archived}
                  <button class="action-btn unarchive-btn" on:click={() => handleUnarchive(tx)}>Unarchive</button>
                {:else}
                  <button class="action-btn archive-btn" on:click={() => handleArchive(tx)}>Archive</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if showForm}
    <TransactionForm
      editingTransaction={editingTransaction}
      {csrfToken}
      onClose={() => {
        showForm = false;
        editingTransaction = undefined;
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
    color: #c9d1d9;
    padding: 0.55rem 1rem;
    border-radius: 6px;
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .toggle-archived-btn:hover {
    background-color: #21262d;
    border-color: #8b949e;
  }

  .add-btn {
    background-color: #238636;
    border: 1px solid #2ea043;
    color: #ffffff;
    padding: 0.55rem 1.2rem;
    border-radius: 6px;
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .add-btn:hover {
    background-color: #2ea043;
  }

  /* Banners */
  .banner {
    padding: 1rem;
    border-radius: 6px;
    font-size: 0.9rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
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
    padding: 0.3rem 0.6rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8rem;
  }

  /* Stats Grid */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .stat-card {
    background-color: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .stat-card .label {
    color: #8b949e;
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat-card .value {
    font-size: 1.6rem;
    font-weight: 700;
  }

  .stat-card.income .value {
    color: #3fdb7f;
  }

  .stat-card.expense .value {
    color: #ff7b72;
  }

  .stat-card.net-flow.positive .value {
    color: #3fdb7f;
  }

  .stat-card.net-flow.negative .value {
    color: #ff7b72;
  }

  .stat-card .subtext {
    color: #8b949e;
    font-size: 0.75rem;
  }

  /* Filters */
  .filters-card {
    background-color: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .filters-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1rem;
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .filter-group label {
    color: #8b949e;
    font-size: 0.8rem;
    font-weight: 500;
  }

  .filter-group select {
    background-color: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #c9d1d9;
    padding: 0.5rem;
    font-size: 0.85rem;
    outline: none;
  }

  .filter-group select:focus {
    border-color: #58a6ff;
  }

  .filters-footer {
    display: flex;
    justify-content: flex-end;
    border-top: 1px solid #30363d;
    padding-top: 0.75rem;
  }

  .clear-filters-btn {
    background: none;
    border: none;
    color: #58a6ff;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .clear-filters-btn:hover {
    color: #79c0ff;
    text-decoration: underline;
  }

  /* Table styles */
  .table-container {
    background-color: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    overflow-x: auto;
  }

  .finance-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    font-size: 0.9rem;
  }

  .finance-table th {
    background-color: #1f242c;
    border-bottom: 1px solid #30363d;
    color: #f0f6fc;
    font-weight: 600;
    padding: 0.8rem 1rem;
  }

  .finance-table td {
    border-bottom: 1px solid #21262d;
    padding: 0.8rem 1rem;
    color: #c9d1d9;
    vertical-align: middle;
  }

  .archived-row {
    background-color: rgba(110, 118, 129, 0.04);
    opacity: 0.6;
  }

  .date-cell {
    white-space: nowrap;
  }

  .payee-text {
    max-width: 150px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: inline-block;
  }

  .badge {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.15rem 0.4rem;
    border-radius: 9999px;
    text-transform: capitalize;
  }

  .type-badge.income {
    background-color: rgba(63, 219, 127, 0.15);
    color: #3fdb7f;
    border: 1px solid rgba(63, 219, 127, 0.3);
  }

  .type-badge.expense {
    background-color: rgba(248, 81, 73, 0.15);
    color: #ff7b72;
    border: 1px solid rgba(248, 81, 73, 0.3);
  }

  .type-badge.transfer {
    background-color: rgba(56, 139, 253, 0.15);
    color: #58a6ff;
    border: 1px solid rgba(56, 139, 253, 0.3);
  }

  .transfer-accounts {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .transfer-accounts .arrow {
    color: #8b949e;
  }

  .transfer-placeholder {
    color: #8b949e;
    font-style: italic;
  }

  /* Splits detail dropdown */
  .splits-disclosure {
    cursor: pointer;
  }

  .splits-summary {
    color: #58a6ff;
    font-weight: 500;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .splits-summary::-webkit-details-marker {
    display: none;
  }

  .splits-summary::before {
    content: "▶";
    font-size: 0.7rem;
    display: inline-block;
    transition: transform 0.2s ease;
  }

  .splits-disclosure[open] .splits-summary::before {
    transform: rotate(90deg);
  }

  .splits-dropdown {
    margin-top: 0.5rem;
    padding: 0.5rem;
    background-color: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .split-detail-row {
    display: flex;
    gap: 0.8rem;
    font-size: 0.8rem;
    align-items: center;
  }

  .split-cat-name {
    color: #f0f6fc;
    font-weight: 500;
  }

  .split-amt {
    color: #8b949e;
  }

  .split-note {
    color: #8b949e;
    font-style: italic;
    font-size: 0.75rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 120px;
  }

  .amount-col {
    text-align: right;
  }

  .amount-value {
    font-weight: 600;
  }

  .amount-value.income {
    color: #3fdb7f;
  }

  .amount-value.expense {
    color: #ff7b72;
  }

  .status-badge {
    font-size: 0.75rem;
    font-weight: 600;
    border-radius: 4px;
    padding: 0.1rem 0.3rem;
  }

  .status-badge.active {
    background-color: rgba(46, 160, 67, 0.15);
    color: #56d364;
  }

  .status-badge.archived {
    background-color: rgba(139, 148, 158, 0.15);
    color: #8b949e;
  }

  .actions-col {
    text-align: right;
    white-space: nowrap;
  }

  .action-btn {
    background: none;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #c9d1d9;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 500;
    padding: 0.25rem 0.5rem;
    transition: all 0.1s ease;
  }

  .action-btn:hover {
    background-color: #21262d;
    border-color: #8b949e;
  }

  .action-btn.archive-btn:hover {
    color: #ff7b72;
    border-color: rgba(248, 81, 73, 0.4);
    background-color: rgba(248, 81, 73, 0.1);
  }

  .action-btn.unarchive-btn:hover {
    color: #56d364;
    border-color: rgba(46, 160, 67, 0.4);
    background-color: rgba(46, 160, 67, 0.1);
  }

  /* Empty / Loading State */
  .loading-state,
  .empty-state {
    background-color: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 3rem 1.5rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
  }

  .empty-state .icon {
    font-size: 2.5rem;
  }

  .empty-state h3 {
    margin: 0;
    color: #f0f6fc;
    font-size: 1.2rem;
  }

  .empty-state p {
    margin: 0 0 0.5rem 0;
    color: #8b949e;
    font-size: 0.9rem;
    max-width: 320px;
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
    to {
      transform: rotate(360deg);
    }
  }

  .numeric {
    font-family: monospace;
  }
</style>
