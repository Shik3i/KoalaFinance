export type AccountType =
  | "checking"
  | "savings"
  | "cash"
  | "credit_card"
  | "paypal"
  | "other";

export interface AccountRecord {
  schemaVersion: 1;
  id: string;
  name: string;
  type: AccountType;
  currency: "EUR";
  openingBalanceMinor?: number; // Signed balance validator
  balanceMode: "manual" | "calculated" | "none";
  currentBalanceMinor?: number; // Signed balance validator
  archived: boolean;
  createdAt: string; // ISO Timestamp
  updatedAt: string; // ISO Timestamp
}

export type CategoryKind = "income" | "expense" | "transfer" | "mixed";

export interface CategoryRecord {
  schemaVersion: 1;
  id: string;
  name: string;
  parentId?: string;
  kind: CategoryKind;
  color?: string;
  icon?: string;
  archived: boolean;
  createdAt: string; // ISO Timestamp
  updatedAt: string; // ISO Timestamp
}

export type RecurringKind = "income" | "expense";
export type RecurringInterval = "weekly" | "monthly" | "quarterly" | "yearly";
export type Necessity = "essential" | "useful" | "optional" | "cancel_candidate";

export interface RecurringItemRecord {
  schemaVersion: 1;
  id: string;
  name: string;
  kind: RecurringKind;
  amountMinor: number; // Non-negative money amount
  currency: "EUR";
  interval: RecurringInterval;
  nextDate?: string; // Plain YYYY-MM-DD date
  categoryId: string;
  accountId?: string;
  necessity: Necessity;
  notes?: string;
  active: boolean;
  archived: boolean;
  createdAt: string; // ISO Timestamp
  updatedAt: string; // ISO Timestamp
}

export type TransactionType = "income" | "expense" | "transfer";

export interface TransactionSplit {
  id: string;
  categoryId: string;
  amountMinor: number; // Non-negative money amount
  note?: string;
}

export interface TransactionRecord {
  schemaVersion: 1;
  id: string;
  date: string; // Plain YYYY-MM-DD date
  type: TransactionType;
  accountId?: string;
  destinationAccountId?: string;
  payee?: string;
  totalAmountMinor: number; // Non-negative money amount
  currency: "EUR";
  splits: TransactionSplit[];
  recurringItemId?: string;
  notes?: string;
  archived: boolean;
  createdAt: string; // ISO Timestamp
  updatedAt: string; // ISO Timestamp
}

export interface BudgetEnvelopeRecord {
  schemaVersion: 1;
  id: string;
  month: string; // Plain YYYY-MM date
  categoryId: string;
  plannedAmountMinor: number; // Non-negative money amount
  rolloverEnabled: boolean;
  note?: string;
  archived: boolean;
  createdAt: string; // ISO Timestamp
  updatedAt: string; // ISO Timestamp
}

export type FinanceRecordType =
  | "account"
  | "category"
  | "recurring_item"
  | "transaction"
  | "budget"
  | "settings";

export interface ValidationError {
  field: string;
  code: string;
  message: string;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: ValidationError[] };

export interface LoadedFinanceRecord<T> {
  recordId: string;        // backend encrypted_records.id
  recordType: FinanceRecordType;
  revision?: number;
  updatedAt?: string;      // backend metadata if available
  payload: T;              // decrypted domain payload
}
