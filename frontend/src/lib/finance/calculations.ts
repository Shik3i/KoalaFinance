import type { RecurringItemRecord, TransactionRecord, BudgetEnvelopeRecord } from "./types";

/**
 * Calculates the monthly equivalent amount in minor units for a recurring item.
 * Uses Math.round() for divisions and returns safe integers.
 */
export function monthlyEquivalentMinor(item: RecurringItemRecord): number {
  if (!item.active) return 0;
  
  switch (item.interval) {
    case "weekly":
      return Math.round((item.amountMinor * 52) / 12);
    case "monthly":
      return item.amountMinor;
    case "quarterly":
      return Math.round(item.amountMinor / 3);
    case "yearly":
      return Math.round(item.amountMinor / 12);
    default:
      return 0;
  }
}

/**
 * Calculates the yearly equivalent amount in minor units for a recurring item.
 */
export function yearlyEquivalentMinor(item: RecurringItemRecord): number {
  if (!item.active) return 0;

  switch (item.interval) {
    case "weekly":
      return item.amountMinor * 52;
    case "monthly":
      return item.amountMinor * 12;
    case "quarterly":
      return item.amountMinor * 4;
    case "yearly":
      return item.amountMinor;
    default:
      return 0;
  }
}

/**
 * Sums the monthly equivalents of active recurring income items.
 */
export function totalMonthlyRecurringIncome(items: RecurringItemRecord[]): number {
  return items
    .filter((item) => item.active && item.kind === "income")
    .reduce((sum, item) => sum + monthlyEquivalentMinor(item), 0);
}

/**
 * Sums the monthly equivalents of active recurring expense items.
 */
export function totalMonthlyRecurringExpenses(items: RecurringItemRecord[]): number {
  return items
    .filter((item) => item.active && item.kind === "expense")
    .reduce((sum, item) => sum + monthlyEquivalentMinor(item), 0);
}

/**
 * Sums the yearly equivalents of active recurring expense items.
 */
export function totalYearlyRecurringExpenses(items: RecurringItemRecord[]): number {
  return items
    .filter((item) => item.active && item.kind === "expense")
    .reduce((sum, item) => sum + yearlyEquivalentMinor(item), 0);
}

/**
 * Aggregates transaction split totals by categoryId for a given month (YYYY-MM).
 */
export function transactionTotalsByCategoryForMonth(
  transactions: TransactionRecord[],
  monthStr: string
): Record<string, number> {
  const totals: Record<string, number> = {};

  transactions.forEach((tx) => {
    // Check if transaction matches plain date prefix YYYY-MM
    if (tx.date && tx.date.startsWith(monthStr)) {
      tx.splits.forEach((split) => {
        const catId = split.categoryId;
        totals[catId] = (totals[catId] || 0) + split.amountMinor;
      });
    }
  });

  return totals;
}

export interface BudgetComparison {
  categoryId: string;
  planned: number;
  actual: number;
}

/**
 * Compares planned budget envelope amounts against actual transaction splits for a given month (YYYY-MM).
 */
export function budgetPlannedVsActualForMonth(
  budgetEnvelopes: BudgetEnvelopeRecord[],
  transactions: TransactionRecord[],
  monthStr: string
): BudgetComparison[] {
  const actuals = transactionTotalsByCategoryForMonth(transactions, monthStr);
  const categories = new Set<string>();

  // Collect all category IDs present in either budget envelopes or actuals
  budgetEnvelopes.forEach((env) => {
    if (env.month === monthStr) {
      categories.add(env.categoryId);
    }
  });
  Object.keys(actuals).forEach((catId) => categories.add(catId));

  const comparisons: BudgetComparison[] = [];
  categories.forEach((catId) => {
    const envelope = budgetEnvelopes.find((env) => env.month === monthStr && env.categoryId === catId);
    const planned = envelope ? envelope.plannedAmountMinor : 0;
    const actual = actuals[catId] || 0;

    comparisons.push({
      categoryId: catId,
      planned,
      actual
    });
  });

  return comparisons;
}
