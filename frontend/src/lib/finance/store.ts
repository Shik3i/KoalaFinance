import { writable, derived } from "svelte/store";
import type { AccountRecord, CategoryRecord, RecurringItemRecord, TransactionRecord, LoadedFinanceRecord } from "./types";
import { fromEncryptedRecord, toEncryptedRecordInput } from "./records";

// In-memory decrypted stores using LoadedFinanceRecord wrapper
export const accounts = writable<LoadedFinanceRecord<AccountRecord>[]>([]);
export const categories = writable<LoadedFinanceRecord<CategoryRecord>[]>([]);
export const recurringItems = writable<LoadedFinanceRecord<RecurringItemRecord>[]>([]);
export const transactions = writable<LoadedFinanceRecord<TransactionRecord>[]>([]);

// Derived store to calculate account balances dynamically for 'calculated' balanceMode
export const derivedAccounts = derived(
  [accounts, transactions],
  ([$accounts, $transactions]) => {
    return $accounts.map(acc => {
      if (acc.payload.balanceMode !== "calculated") {
        return acc;
      }
      let balance = acc.payload.openingBalanceMinor ?? 0;
      const id = acc.payload.id;
      for (const tx of $transactions) {
        if (tx.payload.archived) continue;
        if (tx.payload.type === "income" && tx.payload.accountId === id) {
          balance += tx.payload.totalAmountMinor;
        } else if (tx.payload.type === "expense" && tx.payload.accountId === id) {
          balance -= tx.payload.totalAmountMinor;
        } else if (tx.payload.type === "transfer") {
          if (tx.payload.accountId === id) {
            balance -= tx.payload.totalAmountMinor;
          }
          if (tx.payload.destinationAccountId === id) {
            balance += tx.payload.totalAmountMinor;
          }
        }
      }
      return {
        ...acc,
        payload: {
          ...acc.payload,
          currentBalanceMinor: balance
        }
      };
    });
  }
);

// Loading and diagnostic stores
export const loading = writable<boolean>(false);
export const error = writable<string | null>(null);
export const warning = writable<string | null>(null);

export const totalRecordsLoaded = writable<number>(0);
export const successfullyDecryptedCount = writable<number>(0);
export const skippedRecordsCount = writable<number>(0);

let activeVaultId: string | null = null;
let activeVaultKey: CryptoKey | null = null;

/**
 * Sets the active vault context and triggers a background refresh.
 */
export async function setVault(vaultId: string, vaultKey: CryptoKey) {
  activeVaultId = vaultId;
  activeVaultKey = vaultKey;
  error.set(null);
  warning.set(null);
  await refreshRecords();
}

/**
 * Clears the active vault context and wipes decrypted records from memory.
 */
export function clearVault() {
  activeVaultId = null;
  activeVaultKey = null;
  accounts.set([]);
  categories.set([]);
  recurringItems.set([]);
  transactions.set([]);
  error.set(null);
  warning.set(null);
  totalRecordsLoaded.set(0);
  successfullyDecryptedCount.set(0);
  skippedRecordsCount.set(0);
}

/**
 * Retrieves the currently active vault ID.
 */
export function getActiveVaultId(): string | null {
  return activeVaultId;
}

/**
 * Retrieves the currently active vault key.
 */
export function getActiveVaultKey(): CryptoKey | null {
  return activeVaultKey;
}

/**
 * Fetches all encrypted records for the active vault, decrypts/validates them in-memory,
 * and updates the stores. Skips invalid records with user-facing warnings instead of crashing.
 */
export async function refreshRecords() {
  if (!activeVaultId || !activeVaultKey) return;
  loading.set(true);
  error.set(null);
  warning.set(null);

  try {
    const res = await fetch(`/api/vaults/${activeVaultId}/records`);
    if (!res.ok) {
      throw new Error(`Failed to fetch records: HTTP ${res.status}`);
    }
    const encryptedRecords = await res.json();

    totalRecordsLoaded.set(encryptedRecords.length);

    const accList: LoadedFinanceRecord<AccountRecord>[] = [];
    const catList: LoadedFinanceRecord<CategoryRecord>[] = [];
    const recList: LoadedFinanceRecord<RecurringItemRecord>[] = [];
    const txList: LoadedFinanceRecord<TransactionRecord>[] = [];
    let decryptWarnings = 0;

    for (const rec of encryptedRecords) {
      if (rec.record_type === "account") {
        try {
          const decrypted = await fromEncryptedRecord(rec, activeVaultKey);
          accList.push({
            recordId: rec.id,
            recordType: "account",
            revision: rec.revision,
            updatedAt: rec.updated_at,
            payload: decrypted
          });
        } catch (decErr) {
          console.warn("Skipped invalid decrypted finance record", {
            recordType: rec.record_type,
            recordId: rec.id,
            errorCodes: ["decryption_or_validation_failed"]
          });
          decryptWarnings++;
        }
      } else if (rec.record_type === "category") {
        try {
          const decrypted = await fromEncryptedRecord(rec, activeVaultKey);
          catList.push({
            recordId: rec.id,
            recordType: "category",
            revision: rec.revision,
            updatedAt: rec.updated_at,
            payload: decrypted
          });
        } catch (decErr) {
          console.warn("Skipped invalid decrypted finance record", {
            recordType: rec.record_type,
            recordId: rec.id,
            errorCodes: ["decryption_or_validation_failed"]
          });
          decryptWarnings++;
        }
      } else if (rec.record_type === "recurring_item") {
        try {
          const decrypted = await fromEncryptedRecord(rec, activeVaultKey);
          recList.push({
            recordId: rec.id,
            recordType: "recurring_item",
            revision: rec.revision,
            updatedAt: rec.updated_at,
            payload: decrypted
          });
        } catch (decErr) {
          console.warn("Skipped invalid decrypted finance record", {
            recordType: rec.record_type,
            recordId: rec.id,
            errorCodes: ["decryption_or_validation_failed"]
          });
          decryptWarnings++;
        }
      } else if (rec.record_type === "transaction") {
        try {
          const decrypted = await fromEncryptedRecord(rec, activeVaultKey);
          txList.push({
            recordId: rec.id,
            recordType: "transaction",
            revision: rec.revision,
            updatedAt: rec.updated_at,
            payload: decrypted
          });
        } catch (decErr) {
          console.warn("Skipped invalid decrypted finance record", {
            recordType: rec.record_type,
            recordId: rec.id,
            errorCodes: ["decryption_or_validation_failed"]
          });
          decryptWarnings++;
        }
      }
    }

    accounts.set(accList);
    categories.set(catList);
    recurringItems.set(recList);
    transactions.set(txList);

    successfullyDecryptedCount.set(accList.length + catList.length + recList.length + txList.length);
    skippedRecordsCount.set(decryptWarnings);

    if (decryptWarnings > 0) {
      warning.set(`Warning: ${decryptWarnings} record(s) failed to decrypt/validate and were skipped.`);
    }
  } catch (err: any) {
    error.set(err.message || "Failed to load records");
  } finally {
    loading.set(false);
  }
}

/**
 * Validates, encrypts, and saves a finance record to the backend record API.
 * Uses recordId (backing encrypted record ID) to execute a PUT update, otherwise POSTs new.
 */
export async function saveRecord(
  recordType: "account" | "category" | "recurring_item" | "transaction",
  payload: any,
  recordId: string | undefined,
  csrfToken: string
) {
  if (!activeVaultId || !activeVaultKey) {
    throw new Error("No active vault");
  }

  // 1. Encrypt and validate record
  const encryptedInput = await toEncryptedRecordInput(recordType, payload, activeVaultKey);

  const url = recordId
    ? `/api/vaults/${activeVaultId}/records/${recordId}`
    : `/api/vaults/${activeVaultId}/records`;

  const method = recordId ? "PUT" : "POST";

  const bodyData = recordId
    ? {
        schema_version: encryptedInput.schema_version,
        crypto_version: encryptedInput.crypto_version,
        encrypted_payload: encryptedInput.encrypted_payload,
        nonce: encryptedInput.nonce
      }
    : {
        id: payload.id, // Domain ID is also used as recordId on creation
        ...encryptedInput
      };

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken
    },
    body: JSON.stringify(bodyData)
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `HTTP ${res.status}`);
  }

  // 3. Refresh stores in-memory
  await refreshRecords();
}

/**
 * Archives a finance record by setting archived: true and executing saveRecord.
 */
export async function archiveRecord(
  recordType: "account" | "category" | "recurring_item" | "transaction",
  payload: any,
  recordId: string,
  csrfToken: string
) {
  const updatedPayload = {
    ...payload,
    archived: true,
    updatedAt: new Date().toISOString()
  };
  await saveRecord(recordType, updatedPayload, recordId, csrfToken);
}
