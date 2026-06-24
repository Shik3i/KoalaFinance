<script lang="ts">
  import {
    budgets,
    categories,
    transactions,
    recurringItems,
    loading,
    error,
    warning,
    refreshRecords,
    archiveRecord
  } from "../../finance/store";
  import { formatMinorAsEuro } from "../../finance/money";
  import {
    totalMonthlyRecurringIncome,
    totalMonthlyRecurringExpenses,
    transactionTotalsByCategoryForMonth,
    calculateEnvelopeRollover
  } from "../../finance/calculations";
  import type { BudgetEnvelopeRecord, LoadedFinanceRecord } from "../../finance/types";
  import BudgetEnvelopeForm from "./BudgetEnvelopeForm.svelte";

  export let csrfToken = "";

  let showForm = false;
  let editingBudget: LoadedFinanceRecord<BudgetEnvelopeRecord> | undefined = undefined;
  let selectedMonth = new Date().toISOString().substring(0, 7); // Default to current YYYY-MM
  let defaultCategoryId = "";

  // State calculations
  $: activeBudgets = $budgets.filter((b) => !b.payload.archived && b.payload.month === selectedMonth);
  $: actualSpendingMap = transactionTotalsByCategoryForMonth($transactions.map((t) => t.payload), selectedMonth);

  // Collect category IDs that either have a budget envelope or have actual spending in this month
  $: budgetCategoryIds = activeBudgets.map((b) => b.payload.categoryId);
  $: spentCategoryIds = Object.keys(actualSpendingMap);
  $: uniqueCategoryIds = Array.from(new Set([...budgetCategoryIds, ...spentCategoryIds]));

  // Recalculate summary metrics
  $: estimatedMonthlyIncome = totalMonthlyRecurringIncome($recurringItems.map((r) => r.payload));
  $: estimatedMonthlyExpenses = totalMonthlyRecurringExpenses($recurringItems.map((r) => r.payload));

  $: totalPlannedMinor = activeBudgets.reduce((sum, b) => sum + b.payload.plannedAmountMinor, 0);
  $: totalActualMinor = spentCategoryIds.reduce((sum, catId) => sum + (actualSpendingMap[catId] || 0), 0);

  $: totalRolloverMinor = activeBudgets
    .filter((b) => b.payload.rolloverEnabled)
    .reduce(
      (sum, b) =>
        sum +
        calculateEnvelopeRollover(
          $budgets.map((x) => x.payload),
          $transactions.map((t) => t.payload),
          selectedMonth,
          b.payload.categoryId
        ),
      0
    );

  // Remaining budget sum = Planned + Rollover - Actual
  $: totalRemainingMinor = totalPlannedMinor + totalRolloverMinor - totalActualMinor;

  // Unallocated = Estimated Monthly Income - Total Planned Envelopes
  $: unallocatedEstimateMinor = estimatedMonthlyIncome - totalPlannedMinor;

  // Helper for category information lookups (safe against archived or missing categories)
  function getCategoryInfo(id: string) {
    const cat = $categories.find((c) => c.payload.id === id);
    if (!cat) {
      return { name: "Missing Category", icon: "❓", color: "#6e7681", archived: false, isMissing: true };
    }
    return {
      name: cat.payload.name,
      icon: cat.payload.icon || "🏷️",
      color: cat.payload.color || "#8b949e",
      archived: cat.payload.archived,
      isMissing: false
    };
  }

  function handleEdit(b: LoadedFinanceRecord<BudgetEnvelopeRecord>) {
    editingBudget = b;
    showForm = true;
  }

  function handleAdd() {
    editingBudget = undefined;
    defaultCategoryId = "";
    showForm = true;
  }

  async function handleArchive(b: LoadedFinanceRecord<BudgetEnvelopeRecord>) {
    const catInfo = getCategoryInfo(b.payload.categoryId);
    if (confirm(`Are you sure you want to archive the budget envelope for "${catInfo.name}"?`)) {
      try {
        await archiveRecord("budget", b.payload, b.recordId, csrfToken);
      } catch (err: any) {
        alert(err.message || "Failed to archive budget envelope");
      }
    }
  }

  async function handleUnarchive(b: LoadedFinanceRecord<BudgetEnvelopeRecord>) {
    try {
      const updated = {
        ...b.payload,
        archived: false,
        updatedAt: new Date().toISOString()
      };
      // Check for duplicate active budget before unarchiving
      const duplicate = $budgets.find(
        (x) =>
          !x.payload.archived &&
          x.payload.month === b.payload.month &&
          x.payload.categoryId === b.payload.categoryId &&
          x.payload.id !== b.payload.id
      );

      if (duplicate) {
        alert("Cannot unarchive. An active budget envelope already exists for this category and month.");
        return;
      }

      await archiveRecord("budget", updated, b.recordId, csrfToken);
    } catch (err: any) {
      alert(err.message || "Failed to unarchive budget envelope");
    }
  }
</script>

<div class="view-container">
  <div class="view-header">
    <div>
      <h2>📅 Encrypted Envelope Budgeting</h2>
      <p class="view-desc">Allocate your money into monthly spending envelopes. All budgets remain client-side encrypted.</p>
    </div>
    <div class="header-actions">
      <div class="month-selector-wrapper">
        <label for="budget-month-select">Active Month:</label>
        <input type="month" id="budget-month-select" bind:value={selectedMonth} />
      </div>
      <button class="add-btn" on:click={handleAdd}>
        + Create Envelope
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
      <button class="reload-btn" on:click={refreshRecords}>Reload</button>
    </div>
  {/if}

  <!-- Summary Statistics Grid -->
  <div class="stats-grid">
    <div class="stat-card context">
      <span class="label">Est. Monthly Income</span>
      <span class="value numeric">{formatMinorAsEuro(estimatedMonthlyIncome)} €</span>
      <span class="subtext">From active recurring items</span>
    </div>

    <div class="stat-card context">
      <span class="label">Est. Recurring Costs</span>
      <span class="value numeric">{formatMinorAsEuro(estimatedMonthlyExpenses)} €</span>
      <span class="subtext">Expected recurring expenses</span>
    </div>

    <div class="stat-card planned">
      <span class="label">Total Planned Envelopes</span>
      <span class="value numeric">{formatMinorAsEuro(totalPlannedMinor)} €</span>
      <span class="subtext">Budgeted for {selectedMonth}</span>
    </div>

    <div class="stat-card actual">
      <span class="label">Actual Spending</span>
      <span class="value numeric">{formatMinorAsEuro(totalActualMinor)} €</span>
      <span class="subtext">From expense transactions</span>
    </div>

    <div class="stat-card remaining {totalRemainingMinor >= 0 ? 'positive' : 'negative'}">
      <span class="label">Total Remaining Budget</span>
      <span class="value numeric">
        {totalRemainingMinor >= 0 ? '' : '-'}{formatMinorAsEuro(Math.abs(totalRemainingMinor))} €
      </span>
      <span class="subtext">Planned + Rollover - Actual</span>
    </div>

    <div class="stat-card unallocated {unallocatedEstimateMinor >= 0 ? 'positive' : 'negative'}">
      <span class="label">Unallocated Estimate</span>
      <span class="value numeric">
        {unallocatedEstimateMinor >= 0 ? '' : '-'}{formatMinorAsEuro(Math.abs(unallocatedEstimateMinor))} €
      </span>
      <span class="subtext" title="Estimated income minus planned envelopes. Does not subtract recurring expenses unless they are planned as envelopes.">
        Income - Planned (Estimate)
      </span>
    </div>
  </div>

  <!-- Budget Envelopes List -->
  {#if $loading}
    <div class="loading-state">
      <span class="spinner"></span>
      <p>Loading decrypted budget envelopes...</p>
    </div>
  {:else if uniqueCategoryIds.length === 0}
    <div class="empty-state">
      <span class="icon">📅</span>
      <h3>No budget envelopes for {selectedMonth}</h3>
      <p>Create budget envelopes to distribute your monthly income and track category spending limits.</p>
      <button class="add-btn" on:click={handleAdd}>+ Create Envelope</button>
    </div>
  {:else}
    <div class="table-container">
      <table class="finance-table">
        <thead>
          <tr>
            <th>Category</th>
            <th class="amount-col">Planned</th>
            <th class="amount-col">Rollover Preview</th>
            <th class="amount-col">Actual Spent</th>
            <th class="amount-col">Remaining / Overspent</th>
            <th>Budget Progress</th>
            <th class="actions-col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each uniqueCategoryIds as catId}
            {@const catInfo = getCategoryInfo(catId)}
            {@const envelope = activeBudgets.find((b) => b.payload.categoryId === catId)}
            {@const planned = envelope ? envelope.payload.plannedAmountMinor : 0}
            {@const actual = actualSpendingMap[catId] || 0}
            {@const rollover = envelope && envelope.payload.rolloverEnabled 
              ? calculateEnvelopeRollover(
                  $budgets.map((x) => x.payload),
                  $transactions.map((t) => t.payload),
                  selectedMonth,
                  catId
                ) 
              : 0}
            {@const totalBudget = planned + rollover}
            {@const remaining = totalBudget - actual}
            {@const percent = totalBudget > 0 ? Math.min(Math.round((actual / totalBudget) * 100), 100) : (actual > 0 ? 100 : 0)}
            {@const progressPercentWidth = totalBudget > 0 ? Math.min((actual / totalBudget) * 100, 100) : (actual > 0 ? 100 : 0)}
            
            <tr class="{envelope?.payload.archived ? 'archived-row' : ''}">
              <td class="name-cell">
                <span class="cat-icon-badge" style="background-color: {catInfo.color}15; border: 1px solid {catInfo.color}30; color: {catInfo.color};">
                  {catInfo.icon}
                </span>
                <strong class="cat-name-text">
                  {catInfo.name}
                  {#if catInfo.archived}
                    <span class="inline-archived-tag">(archived)</span>
                  {:else if catInfo.isMissing}
                    <span class="inline-missing-tag">(missing)</span>
                  {/if}
                </strong>
              </td>
              <td class="amount-col numeric">
                {#if envelope}
                  {formatMinorAsEuro(planned)} €
                {:else}
                  <span class="not-budgeted-label">Not Budgeted</span>
                {/if}
              </td>
              <td class="amount-col numeric">
                {#if envelope}
                  {#if envelope.payload.rolloverEnabled}
                    {#if rollover > 0}
                      <span class="rollover-preview-badge" title="Surplus carried over from previous month">
                        +{formatMinorAsEuro(rollover)} €
                      </span>
                    {:else}
                      <span class="rollover-preview-zero">0.00 €</span>
                    {/if}
                  {:else}
                    <span class="rollover-preview-disabled">—</span>
                  {/if}
                {:else}
                  <span class="rollover-preview-disabled">—</span>
                {/if}
              </td>
              <td class="amount-col numeric text-expense">
                {formatMinorAsEuro(actual)} €
              </td>
              <td class="amount-col numeric">
                <span class="amount-value {remaining >= 0 ? 'positive' : 'negative'}">
                  {remaining >= 0 ? '' : '-'}{formatMinorAsEuro(Math.abs(remaining))} €
                </span>
              </td>
              <td class="progress-col">
                <div class="progress-container">
                  <div class="progress-bar-track">
                    <div 
                      class="progress-bar-fill {remaining < 0 ? 'overspent' : percent >= 90 ? 'warning' : 'normal'}" 
                      style="width: {progressPercentWidth}%;"
                    ></div>
                  </div>
                  <span class="progress-percentage-label">{percent}%</span>
                </div>
                {#if envelope && envelope.payload.note}
                  <div class="budget-note-subtext" title={envelope.payload.note}>
                    Note: {envelope.payload.note}
                  </div>
                {/if}
              </td>
              <td class="actions-col">
                {#if envelope}
                  <button class="action-btn edit-btn" on:click={() => handleEdit(envelope)}>Edit</button>
                  {#if envelope.payload.archived}
                    <button class="action-btn unarchive-btn" on:click={() => handleUnarchive(envelope)}>Unarchive</button>
                  {:else}
                    <button class="action-btn archive-btn" on:click={() => handleArchive(envelope)}>Archive</button>
                  {/if}
                {:else}
                  <!-- Allow direct budget envelope creation if category has spent money but no budget -->
                  <button 
                    class="action-btn create-row-btn" 
                    on:click={() => {
                      editingBudget = undefined;
                      defaultCategoryId = catId;
                      showForm = true;
                    }}
                  >
                    Set Budget
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if showForm}
    <BudgetEnvelopeForm
      {editingBudget}
      {csrfToken}
      defaultMonth={selectedMonth}
      {defaultCategoryId}
      onClose={() => {
        showForm = false;
        editingBudget = undefined;
        defaultCategoryId = "";
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
    gap: 1rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .month-selector-wrapper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #c9d1d9;
    font-size: 0.9rem;
    font-weight: 500;
  }

  .month-selector-wrapper input[type="month"] {
    background-color: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #c9d1d9;
    padding: 0.4rem 0.6rem;
    font-size: 0.9rem;
    outline: none;
  }

  .month-selector-wrapper input[type="month"]:focus {
    border-color: #58a6ff;
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
    gap: 1rem;
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
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
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
    font-size: 1.5rem;
    font-weight: 700;
    color: #f0f6fc;
  }

  .stat-card.context .value {
    color: #8b949e;
  }

  .stat-card.planned .value {
    color: #58a6ff;
  }

  .stat-card.actual .value {
    color: #ff7b72;
  }

  .stat-card.remaining.positive .value {
    color: #3fdb7f;
  }

  .stat-card.remaining.negative .value {
    color: #ff7b72;
  }

  .stat-card.unallocated.positive .value {
    color: #3fdb7f;
  }

  .stat-card.unallocated.negative .value {
    color: #ff7b72;
  }

  .stat-card .subtext {
    color: #8b949e;
    font-size: 0.75rem;
  }

  /* Table Style */
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

  .name-cell {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .cat-icon-badge {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.95rem;
  }

  .cat-name-text {
    color: #f0f6fc;
    font-weight: 600;
  }

  .inline-archived-tag {
    color: #8b949e;
    font-size: 0.75rem;
    font-style: italic;
    margin-left: 0.3rem;
  }

  .inline-missing-tag {
    color: #f85149;
    font-size: 0.75rem;
    font-style: italic;
    margin-left: 0.3rem;
  }

  .amount-col {
    text-align: right;
  }

  .not-budgeted-label {
    color: #8b949e;
    font-style: italic;
    font-size: 0.85rem;
  }

  .rollover-preview-badge {
    background-color: rgba(56, 139, 253, 0.15);
    color: #58a6ff;
    border: 1px solid rgba(56, 139, 253, 0.3);
    border-radius: 4px;
    padding: 0.1rem 0.4rem;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .rollover-preview-zero {
    color: #8b949e;
  }

  .rollover-preview-disabled {
    color: #30363d;
  }

  .text-expense {
    color: #ff7b72;
  }

  .amount-value {
    font-weight: 700;
  }

  .amount-value.positive {
    color: #3fdb7f;
  }

  .amount-value.negative {
    color: #ff7b72;
  }

  /* Progress Column */
  .progress-col {
    min-width: 160px;
  }

  .progress-container {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .progress-bar-track {
    flex-grow: 1;
    background-color: #30363d;
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .progress-bar-fill.normal {
    background-color: #2ea043;
  }

  .progress-bar-fill.warning {
    background-color: #d29922;
  }

  .progress-bar-fill.overspent {
    background-color: #f85149;
  }

  .progress-percentage-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: #8b949e;
    min-width: 32px;
    text-align: right;
  }

  .budget-note-subtext {
    font-size: 0.75rem;
    color: #8b949e;
    margin-top: 0.25rem;
    font-style: italic;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
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

  .action-btn.create-row-btn {
    color: #58a6ff;
    border-color: rgba(56, 139, 253, 0.3);
  }

  .action-btn.create-row-btn:hover {
    background-color: rgba(56, 139, 253, 0.15);
    border-color: #58a6ff;
  }

  /* Empty / Loading States */
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
    max-width: 340px;
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
