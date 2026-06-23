import { isValidMinorAmount, isValidSignedMinorAmount } from "./money";
import { isValidPlainDate, isValidBudgetMonth, isValidTimestamp } from "./dates";
import type { ValidationError, ValidationResult } from "./types";

// Helper to validate clean strings without control characters or null bytes
function isValidString(
  val: any,
  minLen = 1,
  maxLen = 120,
  allowWhitespaceControl = false
): boolean {
  if (typeof val !== "string") return false;
  if (val.length < minLen || val.length > maxLen) return false;
  if (val.includes("\x00")) return false; // Null byte check

  // Regex to detect disallowed control characters
  let controlRegex;
  if (allowWhitespaceControl) {
    // Allows newlines (\n, \r) and tabs (\t), rejects other control codes
    controlRegex = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
  } else {
    // Rejects all control codes (0x00 - 0x1F, 0x7F)
    controlRegex = /[\x00-\x1F\x7F]/;
  }
  return !controlRegex.test(val);
}

function makeError(field: string, code: string, message: string): ValidationError {
  return { field, code, message };
}

// 1. Account Validator
export function validateAccount(payload: any): ValidationResult {
  const errors: ValidationError[] = [];

  if (!payload) {
    return { ok: false, errors: [makeError("payload", "required", "Payload is missing")] };
  }

  // schemaVersion
  if (payload.schemaVersion !== 1) {
    errors.push(makeError("schemaVersion", "invalid_type", "schemaVersion must be 1"));
  }

  // id
  if (!isValidString(payload.id, 1, 100)) {
    errors.push(makeError("id", "required", "Valid ID is required (1-100 chars)"));
  }

  // name
  if (!isValidString(payload.name, 1, 120)) {
    errors.push(makeError("name", "required", "Valid account name is required (1-120 chars)"));
  }

  // type
  const validTypes = ["checking", "savings", "cash", "credit_card", "paypal", "other"];
  if (!validTypes.includes(payload.type)) {
    errors.push(makeError("type", "invalid_enum", "Invalid account type"));
  }

  // currency
  if (payload.currency !== "EUR") {
    errors.push(makeError("currency", "invalid_enum", "Currency must be EUR"));
  }

  // openingBalanceMinor
  if (payload.openingBalanceMinor !== undefined && !isValidSignedMinorAmount(payload.openingBalanceMinor)) {
    errors.push(makeError("openingBalanceMinor", "invalid_signed_amount", "openingBalanceMinor must be a safe signed integer"));
  }

  // balanceMode
  const validModes = ["manual", "calculated", "none"];
  if (!validModes.includes(payload.balanceMode)) {
    errors.push(makeError("balanceMode", "invalid_enum", "Invalid balance mode"));
  }

  // currentBalanceMinor
  if (payload.currentBalanceMinor !== undefined && !isValidSignedMinorAmount(payload.currentBalanceMinor)) {
    errors.push(makeError("currentBalanceMinor", "invalid_signed_amount", "currentBalanceMinor must be a safe signed integer"));
  }

  // archived
  if (typeof payload.archived !== "boolean") {
    errors.push(makeError("archived", "invalid_type", "archived must be a boolean"));
  }

  // createdAt
  if (!isValidTimestamp(payload.createdAt)) {
    errors.push(makeError("createdAt", "invalid_timestamp", "createdAt must be a valid ISO timestamp"));
  }

  // updatedAt
  if (!isValidTimestamp(payload.updatedAt)) {
    errors.push(makeError("updatedAt", "invalid_timestamp", "updatedAt must be a valid ISO timestamp"));
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// 2. Category Validator
export function validateCategory(payload: any): ValidationResult {
  const errors: ValidationError[] = [];

  if (!payload) {
    return { ok: false, errors: [makeError("payload", "required", "Payload is missing")] };
  }

  if (payload.schemaVersion !== 1) {
    errors.push(makeError("schemaVersion", "invalid_type", "schemaVersion must be 1"));
  }

  if (!isValidString(payload.id, 1, 100)) {
    errors.push(makeError("id", "required", "Valid ID is required (1-100 chars)"));
  }

  if (!isValidString(payload.name, 1, 120)) {
    errors.push(makeError("name", "required", "Valid category name is required (1-120 chars)"));
  }

  const validKinds = ["income", "expense", "transfer", "mixed"];
  if (!validKinds.includes(payload.kind)) {
    errors.push(makeError("kind", "invalid_enum", "Invalid category kind"));
  }

  if (payload.parentId !== undefined && payload.parentId !== null && !isValidString(payload.parentId, 1, 100)) {
    errors.push(makeError("parentId", "invalid_type", "parentId must be a valid ID string"));
  }

  if (payload.color !== undefined && payload.color !== null && !isValidString(payload.color, 1, 120)) {
    errors.push(makeError("color", "too_long", "color must be a safe string up to 120 chars"));
  }

  if (payload.icon !== undefined && payload.icon !== null && !isValidString(payload.icon, 1, 120)) {
    errors.push(makeError("icon", "too_long", "icon must be a safe string up to 120 chars"));
  }

  if (typeof payload.archived !== "boolean") {
    errors.push(makeError("archived", "invalid_type", "archived must be a boolean"));
  }

  if (!isValidTimestamp(payload.createdAt)) {
    errors.push(makeError("createdAt", "invalid_timestamp", "createdAt must be a valid ISO timestamp"));
  }

  if (!isValidTimestamp(payload.updatedAt)) {
    errors.push(makeError("updatedAt", "invalid_timestamp", "updatedAt must be a valid ISO timestamp"));
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// 3. Recurring Item Validator
export function validateRecurringItem(payload: any): ValidationResult {
  const errors: ValidationError[] = [];

  if (!payload) {
    return { ok: false, errors: [makeError("payload", "required", "Payload is missing")] };
  }

  if (payload.schemaVersion !== 1) {
    errors.push(makeError("schemaVersion", "invalid_type", "schemaVersion must be 1"));
  }

  if (!isValidString(payload.id, 1, 100)) {
    errors.push(makeError("id", "required", "Valid ID is required (1-100 chars)"));
  }

  if (!isValidString(payload.name, 1, 120)) {
    errors.push(makeError("name", "required", "Valid name is required (1-120 chars)"));
  }

  if (payload.kind !== "income" && payload.kind !== "expense") {
    errors.push(makeError("kind", "invalid_enum", "kind must be income or expense"));
  }

  if (!isValidMinorAmount(payload.amountMinor)) {
    errors.push(makeError("amountMinor", "invalid_amount", "amountMinor must be a safe non-negative integer"));
  }

  if (payload.currency !== "EUR") {
    errors.push(makeError("currency", "invalid_enum", "Currency must be EUR"));
  }

  const validIntervals = ["weekly", "monthly", "quarterly", "yearly"];
  if (!validIntervals.includes(payload.interval)) {
    errors.push(makeError("interval", "invalid_enum", "Invalid recurring interval"));
  }

  if (payload.nextDate !== undefined && payload.nextDate !== null && !isValidPlainDate(payload.nextDate)) {
    errors.push(makeError("nextDate", "invalid_date", "nextDate must be in plain YYYY-MM-DD format"));
  }

  if (!isValidString(payload.categoryId, 1, 100)) {
    errors.push(makeError("categoryId", "required", "categoryId is required"));
  }

  if (payload.accountId !== undefined && payload.accountId !== null && !isValidString(payload.accountId, 1, 100)) {
    errors.push(makeError("accountId", "invalid_type", "accountId must be a valid string"));
  }

  const validNecessity = ["essential", "useful", "optional", "cancel_candidate"];
  if (!validNecessity.includes(payload.necessity)) {
    errors.push(makeError("necessity", "invalid_enum", "Invalid necessity setting"));
  }

  if (payload.notes !== undefined && payload.notes !== null) {
    if (!isValidString(payload.notes, 0, 2000, true)) {
      errors.push(makeError("notes", "too_long", "notes must be a safe string up to 2000 chars"));
    }
  }

  if (typeof payload.active !== "boolean") {
    errors.push(makeError("active", "invalid_type", "active must be a boolean"));
  }

  if (!isValidTimestamp(payload.createdAt)) {
    errors.push(makeError("createdAt", "invalid_timestamp", "createdAt must be a valid ISO timestamp"));
  }

  if (!isValidTimestamp(payload.updatedAt)) {
    errors.push(makeError("updatedAt", "invalid_timestamp", "updatedAt must be a valid ISO timestamp"));
  }

  if (typeof payload.archived !== "boolean") {
    errors.push(makeError("archived", "invalid_type", "archived must be a boolean"));
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// 4. Transaction Validator
export function validateTransaction(payload: any): ValidationResult {
  const errors: ValidationError[] = [];

  if (!payload) {
    return { ok: false, errors: [makeError("payload", "required", "Payload is missing")] };
  }

  if (payload.schemaVersion !== 1) {
    errors.push(makeError("schemaVersion", "invalid_type", "schemaVersion must be 1"));
  }

  if (!isValidString(payload.id, 1, 100)) {
    errors.push(makeError("id", "required", "Valid ID is required (1-100 chars)"));
  }

  if (!isValidPlainDate(payload.date)) {
    errors.push(makeError("date", "invalid_date", "date must be in plain YYYY-MM-DD format"));
  }

  const validTypes = ["income", "expense", "transfer"];
  if (!validTypes.includes(payload.type)) {
    errors.push(makeError("type", "invalid_enum", "Invalid transaction type"));
  }

  if (payload.type === "transfer") {
    const hasSource = isValidString(payload.accountId, 1, 100);
    const hasDest = isValidString(payload.destinationAccountId, 1, 100);
    if (!hasSource) {
      errors.push(makeError("accountId", "required", "Source account is required for transfers"));
    }
    if (!hasDest) {
      errors.push(makeError("destinationAccountId", "required", "Destination account is required for transfers"));
    }
    if (hasSource && hasDest && payload.accountId === payload.destinationAccountId) {
      errors.push(makeError("destinationAccountId", "same_accounts", "Source and destination accounts must be different"));
    }
    if (payload.totalAmountMinor <= 0) {
      errors.push(makeError("totalAmountMinor", "invalid_amount", "Transfer amount must be positive"));
    }
  } else {
    if (payload.accountId !== undefined && payload.accountId !== null && !isValidString(payload.accountId, 1, 100)) {
      errors.push(makeError("accountId", "invalid_type", "accountId must be a valid string"));
    }
    if (payload.destinationAccountId !== undefined && payload.destinationAccountId !== null && payload.destinationAccountId !== "") {
      errors.push(makeError("destinationAccountId", "invalid_field", "Destination account must only be set for transfers"));
    }
  }

  if (payload.payee !== undefined && payload.payee !== null && !isValidString(payload.payee, 1, 120)) {
    errors.push(makeError("payee", "too_long", "payee must be a safe string up to 120 chars"));
  }

  if (!isValidMinorAmount(payload.totalAmountMinor)) {
    errors.push(makeError("totalAmountMinor", "invalid_amount", "totalAmountMinor must be a safe non-negative integer"));
  }

  if (payload.currency !== "EUR") {
    errors.push(makeError("currency", "invalid_enum", "Currency must be EUR"));
  }

  // Splits Validation
  if (payload.type === "transfer") {
    if (!Array.isArray(payload.splits) || payload.splits.length !== 0) {
      errors.push(makeError("splits", "invalid_type", "Transfers must not have splits (splits must be empty)"));
    }
  } else {
    if (!Array.isArray(payload.splits) || payload.splits.length === 0) {
      errors.push(makeError("splits", "required", "splits array must contain at least one split"));
    } else {
      let splitsSum = 0;
      payload.splits.forEach((split: any, idx: number) => {
        if (!split || typeof split !== "object") {
          errors.push(makeError(`splits[${idx}]`, "invalid_type", "split must be an object"));
          return;
        }
        if (!isValidString(split.id, 1, 100)) {
          errors.push(makeError(`splits[${idx}].id`, "required", "split id is required"));
        }
        if (!isValidString(split.categoryId, 1, 100)) {
          errors.push(makeError(`splits[${idx}].categoryId`, "required", "split categoryId is required"));
        }
        if (!isValidMinorAmount(split.amountMinor)) {
          errors.push(makeError(`splits[${idx}].amountMinor`, "invalid_amount", "split amountMinor must be a safe non-negative integer"));
        } else {
          splitsSum += split.amountMinor;
        }
        if (split.note !== undefined && split.note !== null) {
          if (!isValidString(split.note, 0, 2000, true)) {
            errors.push(makeError(`splits[${idx}].note`, "too_long", "split note must be a safe string up to 2000 chars"));
          }
        }
      });

      if (splitsSum !== payload.totalAmountMinor) {
        errors.push(makeError("splits", "split_sum_mismatch", "Sum of splits must equal the total amount"));
      }
    }
  }

  if (payload.recurringItemId !== undefined && payload.recurringItemId !== null && !isValidString(payload.recurringItemId, 1, 100)) {
    errors.push(makeError("recurringItemId", "invalid_type", "recurringItemId must be a valid ID"));
  }

  if (payload.notes !== undefined && payload.notes !== null) {
    if (!isValidString(payload.notes, 0, 2000, true)) {
      errors.push(makeError("notes", "too_long", "notes must be a safe string up to 2000 chars"));
    }
  }

  if (typeof payload.archived !== "boolean") {
    errors.push(makeError("archived", "invalid_type", "archived must be a boolean"));
  }

  if (!isValidTimestamp(payload.createdAt)) {
    errors.push(makeError("createdAt", "invalid_timestamp", "createdAt must be a valid ISO timestamp"));
  }

  if (!isValidTimestamp(payload.updatedAt)) {
    errors.push(makeError("updatedAt", "invalid_timestamp", "updatedAt must be a valid ISO timestamp"));
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// 5. Budget Envelope Validator
export function validateBudgetEnvelope(payload: any): ValidationResult {
  const errors: ValidationError[] = [];

  if (!payload) {
    return { ok: false, errors: [makeError("payload", "required", "Payload is missing")] };
  }

  if (payload.schemaVersion !== 1) {
    errors.push(makeError("schemaVersion", "invalid_type", "schemaVersion must be 1"));
  }

  if (!isValidString(payload.id, 1, 100)) {
    errors.push(makeError("id", "required", "Valid ID is required (1-100 chars)"));
  }

  if (!isValidBudgetMonth(payload.month)) {
    errors.push(makeError("month", "invalid_month", "month must be in plain YYYY-MM format"));
  }

  if (!isValidString(payload.categoryId, 1, 100)) {
    errors.push(makeError("categoryId", "required", "categoryId is required"));
  }

  if (!isValidMinorAmount(payload.plannedAmountMinor)) {
    errors.push(makeError("plannedAmountMinor", "invalid_amount", "plannedAmountMinor must be a safe non-negative integer"));
  }

  if (typeof payload.rolloverEnabled !== "boolean") {
    errors.push(makeError("rolloverEnabled", "invalid_type", "rolloverEnabled must be a boolean"));
  }

  if (payload.note !== undefined && payload.note !== null) {
    if (!isValidString(payload.note, 0, 2000, true)) {
      errors.push(makeError("note", "too_long", "note must be a safe string up to 2000 chars"));
    }
  }

  if (!isValidTimestamp(payload.createdAt)) {
    errors.push(makeError("createdAt", "invalid_timestamp", "createdAt must be a valid ISO timestamp"));
  }

  if (!isValidTimestamp(payload.updatedAt)) {
    errors.push(makeError("updatedAt", "invalid_timestamp", "updatedAt must be a valid ISO timestamp"));
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
