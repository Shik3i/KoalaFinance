<script lang="ts">
  import { recurringItems, categories, loading, error, warning } from "../../finance/store";
  import { formatMinorAsEuro } from "../../finance/money";
  import {
    monthlyEquivalentMinor,
    yearlyEquivalentMinor,
    totalMonthlyRecurringExpenses,
    totalYearlyRecurringExpenses
  } from "../../finance/calculations";

  $: activeExpenses = $recurringItems.filter((i) => i.payload.kind === "expense" && i.payload.active && !i.payload.archived);
  
  // Sort active expenses by monthly equivalent descending
  $: sortedExpenses = [...activeExpenses].sort((a, b) => {
    return monthlyEquivalentMinor(b.payload) - monthlyEquivalentMinor(a.payload);
  });

  // Cancel candidates (necessity = "cancel_candidate")
  $: cancelCandidates = activeExpenses.filter((i) => i.payload.necessity === "cancel_candidate");

  // Sums for cancel candidates
  $: totalMonthlyCancelCandidatesMinor = cancelCandidates.reduce(
    (sum, item) => sum + monthlyEquivalentMinor(item.payload),
    0
  );
  $: totalYearlyCancelCandidatesMinor = cancelCandidates.reduce(
    (sum, item) => sum + yearlyEquivalentMinor(item.payload),
    0
  );

  function getCategoryName(catId: string): string {
    const cat = $categories.find((c) => c.payload.id === catId);
    return cat ? `${cat.payload.icon || ""} ${cat.payload.name}` : "Unknown Category";
  }
</script>

<div class="view-container">
  <div class="view-header">
    <div>
      <h2>💳 Subscriptions & Fixed Costs</h2>
      <p class="view-desc">Analyze your active recurring expenses, identify potential savings, and monitor cancel candidates.</p>
    </div>
  </div>

  {#if $error}
    <div class="banner error-banner">
      <strong>Error:</strong> {$error}
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
      <p>Loading subscription details...</p>
    </div>
  {:else}
    <!-- Summary Cards -->
    <div class="summary-cards-grid">
      <div class="summary-card">
        <span class="card-icon">💸</span>
        <div class="card-content">
          <span class="card-label">Total Monthly Expenses</span>
          <span class="card-val">{formatMinorAsEuro(totalMonthlyRecurringExpenses($recurringItems.map(i => i.payload)))} €</span>
        </div>
      </div>

      <div class="summary-card">
        <span class="card-icon">📅</span>
        <div class="card-content">
          <span class="card-label">Total Yearly Expenses</span>
          <span class="card-val">{formatMinorAsEuro(totalYearlyRecurringExpenses($recurringItems.map(i => i.payload)))} €</span>
        </div>
      </div>

      <div class="summary-card warning-card">
        <span class="card-icon">⚠️</span>
        <div class="card-content">
          <span class="card-label">Monthly Cancel Candidates</span>
          <span class="card-val">{formatMinorAsEuro(totalMonthlyCancelCandidatesMinor)} €</span>
        </div>
      </div>

      <div class="summary-card warning-card">
        <span class="card-icon">⏳</span>
        <div class="card-content">
          <span class="card-label">Yearly Cancel Candidates</span>
          <span class="card-val">{formatMinorAsEuro(totalYearlyCancelCandidatesMinor)} €</span>
        </div>
      </div>

      <div class="summary-card info-card">
        <span class="card-icon">📊</span>
        <div class="card-content">
          <span class="card-label">Active Expenses</span>
          <span class="card-val">{activeExpenses.length} items</span>
        </div>
      </div>

      <div class="summary-card info-card">
        <span class="card-icon">🛑</span>
        <div class="card-content">
          <span class="card-label">Cancel Candidates</span>
          <span class="card-val">{cancelCandidates.length} items</span>
        </div>
      </div>
    </div>

    <!-- Active Subscriptions Table -->
    {#if sortedExpenses.length === 0}
      <div class="empty-state">
        <span class="icon">💳</span>
        <h3>No active recurring expenses found</h3>
        <p>Go to the Recurring tab and add recurring expenses with Active checked to populate this view.</p>
      </div>
    {:else}
      <div class="table-title-bar">
        <h3>Active Subscriptions list (Sorted by Monthly Cost)</h3>
      </div>
      <div class="table-container">
        <table class="finance-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Necessity</th>
              <th>Billing Amount</th>
              <th>Interval</th>
              <th class="amount-col">Monthly Cost</th>
              <th class="amount-col">Yearly Cost</th>
              <th>Next Date</th>
              <th>Notes Preview</th>
            </tr>
          </thead>
          <tbody>
            {#each sortedExpenses as item}
              <tr class={item.payload.necessity === "cancel_candidate" ? "cancel-candidate-row" : ""}>
                <td class="name-cell">
                  <strong>{item.payload.name}</strong>
                  {#if item.payload.necessity === "cancel_candidate"}
                    <span class="cancel-tag">Reviewing</span>
                  {/if}
                </td>
                <td>
                  {getCategoryName(item.payload.categoryId)}
                </td>
                <td>
                  <span class="badge necessity-badge {item.payload.necessity}">
                    {item.payload.necessity.replace('_', ' ')}
                  </span>
                </td>
                <td class="numeric">
                  {formatMinorAsEuro(item.payload.amountMinor)} €
                </td>
                <td>
                  <span class="interval-text">{item.payload.interval}</span>
                </td>
                <td class="amount-col numeric highlight-col">
                  {formatMinorAsEuro(monthlyEquivalentMinor(item.payload))} €
                </td>
                <td class="amount-col numeric">
                  {formatMinorAsEuro(yearlyEquivalentMinor(item.payload))} €
                </td>
                <td>
                  {item.payload.nextDate || "—"}
                </td>
                <td class="notes-preview-cell" title={item.payload.notes ?? ""}>
                  {item.payload.notes ? (item.payload.notes.length > 40 ? item.payload.notes.substring(0, 37) + "..." : item.payload.notes) : "—"}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
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
    border-bottom: 1px solid #30363d;
    padding-bottom: 1rem;
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

  .banner {
    border-radius: 6px;
    padding: 0.8rem 1rem;
    font-size: 0.9rem;
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

  .summary-cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1rem;
  }

  .summary-card {
    background-color: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 1rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    box-sizing: border-box;
  }

  .card-icon {
    font-size: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #0d1117;
    border: 1px solid #30363d;
    border-radius: 8px;
    width: 48px;
    height: 48px;
  }

  .card-content {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    overflow: hidden;
  }

  .card-label {
    color: #8b949e;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .card-val {
    color: #f0f6fc;
    font-size: 1.25rem;
    font-weight: 700;
    font-family: monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .warning-card {
    border-color: rgba(248, 81, 73, 0.3);
  }

  .warning-card .card-icon {
    background-color: rgba(248, 81, 73, 0.05);
    border-color: rgba(248, 81, 73, 0.3);
  }

  .warning-card .card-val {
    color: #ff7b72;
  }

  .info-card {
    border-color: rgba(56, 139, 253, 0.3);
  }

  .info-card .card-icon {
    background-color: rgba(56, 139, 253, 0.05);
    border-color: rgba(56, 139, 253, 0.3);
  }

  .info-card .card-val {
    color: #58a6ff;
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
    margin-top: 1rem;
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
    margin: 0;
    color: #8b949e;
    font-size: 0.95rem;
    max-width: 360px;
  }

  .table-title-bar {
    margin-top: 1.5rem;
  }

  .table-title-bar h3 {
    margin: 0;
    color: #c9d1d9;
    font-size: 1rem;
    font-weight: 600;
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

  .cancel-candidate-row {
    background-color: rgba(248, 81, 73, 0.02);
  }

  .name-cell {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .name-cell strong {
    color: #f0f6fc;
  }

  .cancel-tag {
    background-color: rgba(248, 81, 73, 0.15);
    border: 1px solid rgba(248, 81, 73, 0.4);
    color: #ff7b72;
    border-radius: 4px;
    font-size: 0.7rem;
    padding: 0.05rem 0.25rem;
    font-weight: 600;
  }

  .amount-col {
    text-align: right;
  }

  .numeric {
    font-family: monospace;
    font-size: 0.95rem;
  }

  .highlight-col {
    color: #f0f6fc;
    font-weight: 600;
  }

  .interval-text {
    text-transform: capitalize;
    color: #8b949e;
  }

  .badge {
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.1rem 0.4rem;
    display: inline-block;
    text-transform: capitalize;
  }

  .necessity-badge.essential { color: #ff7b72; background-color: rgba(248, 81, 73, 0.1); border: 1px solid rgba(248, 81, 73, 0.2); }
  .necessity-badge.useful { color: #d29922; background-color: rgba(210, 153, 34, 0.1); border: 1px solid rgba(210, 153, 34, 0.2); }
  .necessity-badge.optional { color: #58a6ff; background-color: rgba(56, 139, 253, 0.1); border: 1px solid rgba(56, 139, 253, 0.2); }
  .necessity-badge.cancel_candidate { color: #ff7b72; border: 1px dashed #ff7b72; background-color: transparent; }

  .notes-preview-cell {
    color: #8b949e;
    font-size: 0.85rem;
    max-width: 150px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
