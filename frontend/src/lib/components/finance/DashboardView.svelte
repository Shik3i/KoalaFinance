<script lang="ts">
  import {
    accounts,
    transactions,
    budgets,
    recurringItems,
    categories,
    loading
  } from "../../finance/store";
  import { formatMinorAsEuro } from "../../finance/money";
  import {
    totalActualIncomeForMonth,
    totalActualExpensesForMonth,
    calculateSavingsRate,
    totalMonthlyRecurringIncome,
    totalMonthlyRecurringExpenses,
    totalMonthlyCancelCandidates,
    totalYearlyCancelCandidates,
    calculateBudgetHealth,
    transactionTotalsByCategoryForMonth
  } from "../../finance/calculations";

  export let onChangeTab: (tab: string) => void = () => {};

  // Select month (default to current YYYY-MM)
  let selectedMonth = new Date().toISOString().substring(0, 7);

  // Unwrap reactive store values for safe computation
  $: rawTransactions = $transactions.map((t) => t.payload);
  $: rawBudgets = $budgets.map((b) => b.payload);
  $: rawRecurring = $recurringItems.map((r) => r.payload);

  // Calculations for selected month
  $: actualIncome = totalActualIncomeForMonth(rawTransactions, selectedMonth);
  $: actualExpenses = totalActualExpensesForMonth(rawTransactions, selectedMonth);
  $: savings = actualIncome - actualExpenses;
  $: savingsRateDecimal = calculateSavingsRate(actualIncome, actualExpenses);
  $: savingsRatePercent = Math.round(savingsRateDecimal * 100);

  // Recurring Estimates
  $: recurringIncomeEst = totalMonthlyRecurringIncome(rawRecurring);
  $: recurringExpenseEst = totalMonthlyRecurringExpenses(rawRecurring);

  // Cancel Candidates
  $: monthlyCancelSavings = totalMonthlyCancelCandidates(rawRecurring);
  $: yearlyCancelSavings = totalYearlyCancelCandidates(rawRecurring);
  $: cancelCandidatesList = rawRecurring.filter(
    (item) => item.active && item.kind === "expense" && item.necessity === "cancel_candidate"
  );

  // Budget Health
  $: budgetHealth = calculateBudgetHealth(rawBudgets, rawTransactions, selectedMonth);

  // Category Spending Breakdown
  $: categoryTotals = transactionTotalsByCategoryForMonth(rawTransactions, selectedMonth);
  $: sortedCategories = Object.entries(categoryTotals)
    .map(([catId, amount]) => {
      const cat = $categories.find((c) => c.payload.id === catId);
      return {
        id: catId,
        amount,
        name: cat ? cat.payload.name : "Missing Category",
        icon: cat ? (cat.payload.icon || "🏷️") : "❓",
        color: cat ? (cat.payload.color || "#8b949e") : "#6e7681",
        archived: cat ? cat.payload.archived : false
      };
    })
    .sort((a, b) => b.amount - a.amount);

  // Has any data for the selected month?
  $: hasData = actualIncome > 0 || actualExpenses > 0 || sortedCategories.length > 0 || budgetHealth.plannedTotal > 0;

  // Percentage spent of budget
  $: budgetSpentPercent = budgetHealth.plannedTotal > 0 
    ? Math.min(Math.round((budgetHealth.actualTotal / budgetHealth.plannedTotal) * 100), 100) 
    : (budgetHealth.actualTotal > 0 ? 100 : 0);
</script>

<div class="dashboard-container">
  <div class="dashboard-header">
    <div>
      <h2>📊 Financial Dashboard</h2>
      <p class="header-desc">Private client-side financial intelligence and monthly reports.</p>
    </div>
    <div class="month-selector-wrapper">
      <label for="dash-month-select">Selected Month:</label>
      <input type="month" id="dash-month-select" bind:value={selectedMonth} />
    </div>
  </div>

  {#if $loading}
    <div class="loading-state">
      <span class="spinner"></span>
      <p>Decrypting vault records and compiling report...</p>
    </div>
  {:else if !hasData}
    <div class="onboarding-guide">
      <div class="onboarding-header">
        <span class="onboarding-logo">🐨</span>
        <h3>Welcome to your Vault!</h3>
        <p>Follow these steps to set up your financial workspace:</p>
      </div>

      <div class="steps-checklist">
        <div class="step-card {$accounts.length > 0 ? 'completed' : ''}">
          <div class="step-status">
            {#if $accounts.length > 0}
              <span class="status-icon success">✓</span>
            {:else}
              <span class="status-number">1</span>
            {/if}
          </div>
          <div class="step-info">
            <h4>Create a Financial Account</h4>
            <p>Add bank accounts, credit cards, or cash wallets to track their balances.</p>
            {#if $accounts.length === 0}
              <button class="step-action-btn" on:click={() => onChangeTab('accounts')}>Go to Accounts</button>
            {/if}
          </div>
        </div>

        <div class="step-card {$transactions.length > 0 ? 'completed' : ''}">
          <div class="step-status">
            {#if $transactions.length > 0}
              <span class="status-icon success">✓</span>
            {:else}
              <span class="status-number">2</span>
            {/if}
          </div>
          <div class="step-info">
            <h4>Record your first Transaction</h4>
            <p>Record your income, expenses, or transfers between accounts. You can also split expenses across multiple categories!</p>
            {#if $transactions.length === 0}
              <button class="step-action-btn" on:click={() => onChangeTab('transactions')} disabled={$accounts.length === 0}>
                Go to Transactions
              </button>
              {#if $accounts.length === 0}
                <span class="action-tip">Requires an active account</span>
              {/if}
            {/if}
          </div>
        </div>

        <div class="step-card {$budgets.length > 0 ? 'completed' : ''}">
          <div class="step-status">
            {#if $budgets.length > 0}
              <span class="status-icon success">✓</span>
            {:else}
              <span class="status-number">3</span>
            {/if}
          </div>
          <div class="step-info">
            <h4>Define Monthly Budgets</h4>
            <p>Allocate spending limits for your expense categories (envelope budgeting) to track planned vs. actual limits.</p>
            {#if $budgets.length === 0}
              <button class="step-action-btn" on:click={() => onChangeTab('budgets')}>Go to Budgets</button>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {:else}
    <!-- Top-Level Metrics Grid -->
    <div class="metrics-grid">
      <div class="metric-card income">
        <span class="card-icon">📥</span>
        <div class="metric-info">
          <span class="label">Actual Income</span>
          <span class="value numeric">{formatMinorAsEuro(actualIncome)} €</span>
          <span class="subtext">Non-archived receipts</span>
        </div>
      </div>

      <div class="metric-card expense">
        <span class="card-icon">📤</span>
        <div class="metric-info">
          <span class="label">Actual Expenses</span>
          <span class="value numeric">{formatMinorAsEuro(actualExpenses)} €</span>
          <span class="subtext">Non-archived spending</span>
        </div>
      </div>

      <div class="metric-card savings {savings >= 0 ? 'positive' : 'negative'}">
        <span class="card-icon">{savings >= 0 ? '💰' : '⚠️'}</span>
        <div class="metric-info">
          <span class="label">Net Savings</span>
          <span class="value numeric">
            {savings >= 0 ? '' : '-'}{formatMinorAsEuro(Math.abs(savings))} €
          </span>
          <span class="subtext">Income minus expenses</span>
        </div>
      </div>

      <div class="metric-card savings-rate {savingsRatePercent >= 20 ? 'high-save' : savingsRatePercent > 0 ? 'low-save' : 'negative-save'}">
        <span class="card-icon">📈</span>
        <div class="metric-info">
          <span class="label">Savings Rate</span>
          <span class="value numeric">{savingsRatePercent}%</span>
          <span class="subtext">Target: 20%+</span>
        </div>
      </div>
    </div>

    <!-- Middle Section: Categories vs Budgets -->
    <div class="dashboard-details-grid">
      <!-- Category Spending Breakdown (CSS Horizontal Bars) -->
      <div class="detail-panel categories-panel">
        <h3>Top Spending Categories</h3>
        {#if sortedCategories.length === 0}
          <div class="panel-empty-state">No expense transactions recorded.</div>
        {:else}
          <div class="category-bars-list">
            {#each sortedCategories as cat}
              {@const pct = actualExpenses > 0 ? Math.round((cat.amount / actualExpenses) * 100) : 0}
              <div class="category-bar-row">
                <div class="bar-meta">
                  <span class="cat-label">
                    <span class="icon-span" style="background-color: {cat.color}15; color: {cat.color}; border: 1px solid {cat.color}30;">
                      {cat.icon}
                    </span>
                    <strong class="cat-name">{cat.name} {#if cat.archived}<span class="archived-label">(archived)</span>{/if}</strong>
                  </span>
                  <span class="cat-amount numeric">{formatMinorAsEuro(cat.amount)} € ({pct}%)</span>
                </div>
                <div class="bar-track">
                  <div class="bar-fill" style="width: {pct}%; background-color: {cat.color};"></div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Budget Health Summary -->
      <div class="detail-panel budget-health-panel">
        <h3>Envelope Budget Health</h3>
        {#if budgetHealth.plannedTotal === 0}
          <div class="panel-empty-state">
            No budget envelopes defined for {selectedMonth}.
          </div>
        {:else}
          <div class="budget-health-metrics">
            <div class="budget-status-row">
              <div class="status-box">
                <span class="box-label">Planned Envelopes</span>
                <span class="box-val numeric">{formatMinorAsEuro(budgetHealth.plannedTotal)} €</span>
              </div>
              <div class="status-box">
                <span class="box-label">Spent in Envelopes</span>
                <span class="box-val numeric">{formatMinorAsEuro(budgetHealth.actualTotal)} €</span>
              </div>
              <div class="status-box {budgetHealth.remainingTotal >= 0 ? 'positive' : 'negative'}">
                <span class="box-label">Remaining Budget</span>
                <span class="box-val numeric">{formatMinorAsEuro(budgetHealth.remainingTotal)} €</span>
              </div>
            </div>

            <div class="budget-progress-section">
              <div class="progress-labels">
                <span>Budget Limit Utilization</span>
                <span>{budgetSpentPercent}%</span>
              </div>
              <div class="progress-bar-track">
                <div 
                  class="progress-bar-fill {budgetHealth.remainingTotal < 0 ? 'overspent' : budgetSpentPercent >= 90 ? 'warning' : 'normal'}" 
                  style="width: {budgetSpentPercent}%;"
                ></div>
              </div>
            </div>

            {#if budgetHealth.overspentCount > 0}
              <div class="alert-card warning">
                <span class="alert-icon">⚠️</span>
                <div>
                  <strong>{budgetHealth.overspentCount} Overspent Category Envelopes</strong>
                  <p>Check the Budgets tab to identify which envelopes have exceeded their planned limits.</p>
                </div>
              </div>
            {:else}
              <div class="alert-card success">
                <span class="alert-icon">✅</span>
                <div>
                  <strong>All Envelopes On Track</strong>
                  <p>None of your active budget envelopes are currently overspent for this month.</p>
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <!-- Bottom Section: Recurring & Commitments -->
    <div class="dashboard-details-grid">
      <!-- Recurring Income & Expense Context -->
      <div class="detail-panel recurring-panel">
        <h3>Estimated Monthly Commitments</h3>
        <p class="panel-desc">Calculated from your active recurring items.</p>
        <div class="recurring-totals">
          <div class="rec-total-card income">
            <span class="lbl">Est. Monthly Inflow</span>
            <span class="val numeric">{formatMinorAsEuro(recurringIncomeEst)} €</span>
          </div>
          <div class="rec-total-card expense">
            <span class="lbl">Est. Monthly Outflow</span>
            <span class="val numeric">{formatMinorAsEuro(recurringExpenseEst)} €</span>
          </div>
        </div>
      </div>

      <!-- Subscription Cancel Candidates Panel -->
      <div class="detail-panel cancel-candidates-panel">
        <h3>Subscription Optimization</h3>
        <p class="panel-desc">Potential savings from active items marked as cancel candidates.</p>
        
        <div class="cancel-savings-summary">
          <div class="opt-card">
            <span class="opt-label">Monthly Potential Savings</span>
            <span class="opt-value numeric text-highlight">{formatMinorAsEuro(monthlyCancelSavings)} €</span>
          </div>
          <div class="opt-card">
            <span class="opt-label">Yearly Potential Savings</span>
            <span class="opt-value numeric text-highlight">{formatMinorAsEuro(yearlyCancelSavings)} €</span>
          </div>
        </div>

        {#if cancelCandidatesList.length > 0}
          <div class="candidate-list">
            <h4>Cancel Candidates ({cancelCandidatesList.length})</h4>
            <div class="candidate-items-scroll">
              {#each cancelCandidatesList as item}
                <div class="candidate-row">
                  <div class="cand-meta">
                    <strong class="cand-name">{item.name}</strong>
                    <span class="cand-interval">{item.interval}</span>
                  </div>
                  <span class="cand-amount numeric">-{formatMinorAsEuro(item.amountMinor)} €</span>
                </div>
              {/each}
            </div>
          </div>
        {:else}
          <div class="panel-success-state">
            🎉 Nice! No active recurring items are flagged as cancel candidates.
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .dashboard-container {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1.5rem;
    box-sizing: border-box;
  }

  .dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #30363d;
    padding-bottom: 1rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .dashboard-header h2 {
    margin: 0;
    color: #f0f6fc;
    font-size: 1.5rem;
  }

  .header-desc {
    margin: 0.3rem 0 0 0;
    color: #8b949e;
    font-size: 0.9rem;
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

  /* Metrics Grid */
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1rem;
  }

  .metric-card {
    background-color: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 1.2rem;
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .metric-card .card-icon {
    font-size: 2rem;
    background-color: rgba(110, 118, 129, 0.08);
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
  }

  .metric-info {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .metric-info .label {
    color: #8b949e;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .metric-info .value {
    font-size: 1.35rem;
    font-weight: 700;
    color: #f0f6fc;
  }

  .metric-card.income .value {
    color: #3fdb7f;
  }

  .metric-card.expense .value {
    color: #ff7b72;
  }

  .metric-card.savings.positive .value {
    color: #3fdb7f;
  }

  .metric-card.savings.negative .value {
    color: #ff7b72;
  }

  .savings-rate.high-save .value {
    color: #3fdb7f;
  }

  .savings-rate.low-save .value {
    color: #d29922;
  }

  .savings-rate.negative-save .value {
    color: #ff7b72;
  }

  .metric-info .subtext {
    color: #8b949e;
    font-size: 0.75rem;
  }

  /* Details Grid */
  .dashboard-details-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    gap: 1.5rem;
    margin-bottom: 1rem;
  }

  .detail-panel {
    background-color: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 1.25rem;
    box-sizing: border-box;
  }

  .detail-panel h3 {
    margin: 0 0 0.5rem 0;
    color: #f0f6fc;
    font-size: 1.1rem;
  }

  .panel-desc {
    margin: 0 0 1.2rem 0;
    color: #8b949e;
    font-size: 0.85rem;
  }

  .panel-empty-state {
    color: #8b949e;
    font-style: italic;
    text-align: center;
    padding: 2.5rem 1rem;
    font-size: 0.9rem;
    border: 1px dashed #30363d;
    border-radius: 6px;
  }

  /* Category Bars List */
  .category-bars-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .category-bar-row {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .bar-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.85rem;
  }

  .cat-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .icon-span {
    width: 24px;
    height: 24px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
  }

  .cat-name {
    color: #f0f6fc;
  }

  .archived-label {
    color: #8b949e;
    font-size: 0.75rem;
    font-style: italic;
    font-weight: normal;
  }

  .cat-amount {
    color: #c9d1d9;
    font-weight: 500;
  }

  .bar-track {
    background-color: #21262d;
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  /* Budget Health Details */
  .budget-health-metrics {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .budget-status-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.8rem;
  }

  .status-box {
    background-color: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .status-box .box-label {
    color: #8b949e;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .status-box .box-val {
    font-size: 1.05rem;
    font-weight: 700;
    color: #f0f6fc;
  }

  .status-box.positive .box-val {
    color: #3fdb7f;
  }

  .status-box.negative .box-val {
    color: #ff7b72;
  }

  .budget-progress-section {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .progress-labels {
    display: flex;
    justify-content: space-between;
    color: #c9d1d9;
    font-size: 0.85rem;
    font-weight: 500;
  }

  .progress-bar-track {
    background-color: #30363d;
    height: 10px;
    border-radius: 5px;
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    border-radius: 5px;
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

  /* Alert Card */
  .alert-card {
    border-radius: 6px;
    padding: 0.75rem 1rem;
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    font-size: 0.85rem;
  }

  .alert-card.warning {
    background-color: rgba(210, 153, 34, 0.1);
    border: 1px solid #d29922;
    color: #c9d1d9;
  }

  .alert-card.warning .alert-icon {
    font-size: 1.1rem;
  }

  .alert-card.success {
    background-color: rgba(46, 160, 67, 0.1);
    border: 1px solid #2ea043;
    color: #c9d1d9;
  }

  .alert-card.success .alert-icon {
    font-size: 1.1rem;
  }

  .alert-card p {
    margin: 0.2rem 0 0 0;
    color: #8b949e;
    font-size: 0.8rem;
  }

  /* Recurring totals */
  .recurring-totals {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }

  .rec-total-card {
    background-color: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .rec-total-card .lbl {
    color: #8b949e;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .rec-total-card .val {
    font-size: 1.2rem;
    font-weight: 700;
    color: #c9d1d9;
  }

  .rec-total-card.income .val {
    color: #8b949e;
  }

  .rec-total-card.expense .val {
    color: #ff7b72;
  }

  /* Subscriptions Optimization & Cancel Candidates */
  .cancel-savings-summary {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .opt-card {
    background-color: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .opt-label {
    color: #8b949e;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .opt-value {
    font-size: 1.1rem;
    font-weight: 700;
    color: #f85149;
  }

  .opt-value.text-highlight {
    color: #ff7b72;
  }

  .candidate-list h4 {
    margin: 0 0 0.5rem 0;
    color: #f0f6fc;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .candidate-items-scroll {
    max-height: 140px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .candidate-row {
    background-color: rgba(248, 81, 73, 0.05);
    border: 1px solid rgba(248, 81, 73, 0.15);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.85rem;
  }

  .cand-meta {
    display: flex;
    flex-direction: column;
  }

  .cand-name {
    color: #f0f6fc;
  }

  .cand-interval {
    color: #8b949e;
    font-size: 0.75rem;
  }

  .cand-amount {
    color: #ff7b72;
    font-weight: 600;
  }

  .panel-success-state {
    color: #2ea043;
    font-size: 0.85rem;
    background-color: rgba(46, 160, 67, 0.05);
    border: 1px solid rgba(46, 160, 67, 0.15);
    border-radius: 6px;
    padding: 1rem;
    text-align: center;
  }

  /* Empty / Loading States */
  .loading-state {
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

  /* Onboarding Guide */
  .onboarding-guide {
    background-color: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 2.5rem 2rem;
    max-width: 700px;
    margin: 2rem auto;
    box-sizing: border-box;
  }

  .onboarding-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .onboarding-logo {
    font-size: 3rem;
    display: block;
    margin-bottom: 0.5rem;
  }

  .onboarding-header h3 {
    margin: 0 0 0.5rem 0;
    color: #f0f6fc;
    font-size: 1.4rem;
  }

  .onboarding-header p {
    margin: 0;
    color: #8b949e;
    font-size: 0.95rem;
  }

  .steps-checklist {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .step-card {
    background-color: #0d1117;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 1.25rem;
    display: flex;
    gap: 1.25rem;
    align-items: flex-start;
    transition: all 0.2s ease;
  }

  .step-card.completed {
    border-color: rgba(46, 160, 67, 0.4);
    background-color: rgba(46, 160, 67, 0.02);
  }

  .step-status {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    font-size: 0.9rem;
    font-weight: bold;
  }

  .step-card:not(.completed) .step-status {
    background-color: #21262d;
    border: 1px solid #30363d;
    color: #c9d1d9;
  }

  .step-status .status-icon.success {
    background-color: #238636;
    color: #ffffff;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .step-info {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .step-info h4 {
    margin: 0;
    font-size: 1.05rem;
    color: #f0f6fc;
  }

  .step-card.completed .step-info h4 {
    text-decoration: line-through;
    color: #8b949e;
  }

  .step-info p {
    margin: 0;
    font-size: 0.88rem;
    color: #8b949e;
    line-height: 1.4;
  }

  .step-action-btn {
    align-self: flex-start;
    background-color: #21262d;
    border: 1px solid #30363d;
    color: #c9d1d9;
    border-radius: 6px;
    padding: 0.4rem 0.8rem;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    margin-top: 0.4rem;
    transition: all 0.15s ease;
  }

  .step-action-btn:hover:not(:disabled) {
    background-color: #30363d;
    color: #f0f6fc;
    border-color: #8b949e;
  }

  .step-action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-tip {
    font-size: 0.75rem;
    color: #f85149;
    margin-top: 0.25rem;
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
