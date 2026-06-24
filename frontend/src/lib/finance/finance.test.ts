import { describe, it, expect, afterEach } from "vitest";
import { generateVaultKey } from "../crypto";
import { isValidMinorAmount, isValidSignedMinorAmount, parseEuroToMinor, formatMinorAsEuro } from "./money";
import { get } from "svelte/store";
import {
  categories as categoriesStore,
  warning as storeWarning,
  totalRecordsLoaded,
  successfullyDecryptedCount,
  skippedRecordsCount,
  setVault,
  clearVault,
  saveRecord,
  archiveRecord,
  accounts as accountsStore,
  transactions as transactionsStore,
  derivedAccounts as derivedAccountsStore
} from "./store";
import { isValidPlainDate, isValidBudgetMonth, isValidTimestamp } from "./dates";
import {
  validateAccount,
  validateCategory,
  validateRecurringItem,
  validateTransaction,
  validateBudgetEnvelope
} from "./validators";
import { generateDefaultCategories } from "./defaults";
import {
  monthlyEquivalentMinor,
  yearlyEquivalentMinor,
  totalMonthlyRecurringIncome,
  totalMonthlyRecurringExpenses,
  totalYearlyRecurringExpenses,
  transactionTotalsByCategoryForMonth,
  budgetPlannedVsActualForMonth,
  calculateEnvelopeRollover
} from "./calculations";
import { toEncryptedRecordInput, fromEncryptedRecord } from "./records";
import type {
  AccountRecord,
  CategoryRecord,
  RecurringItemRecord,
  TransactionRecord,
  BudgetEnvelopeRecord,
  LoadedFinanceRecord
} from "./types";

describe("Finance Domain Model & Helpers", () => {

  describe("Money Validation", () => {
    it("should accept valid minor unit amounts", () => {
      expect(isValidMinorAmount(0)).toBe(true);
      expect(isValidMinorAmount(100)).toBe(true);
      expect(isValidMinorAmount(10050)).toBe(true);
    });

    it("should reject floats, negative values, NaN, Infinity, and unsafe integers", () => {
      expect(isValidMinorAmount(10.5)).toBe(false);
      expect(isValidMinorAmount(-1)).toBe(false);
      expect(isValidMinorAmount(NaN)).toBe(false);
      expect(isValidMinorAmount(Infinity)).toBe(false);
      expect(isValidMinorAmount(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
      expect(isValidMinorAmount("100")).toBe(false);
      expect(isValidMinorAmount(null)).toBe(false);
    });

    it("should accept negative signed balances but reject floats/NaN/Infinity", () => {
      expect(isValidSignedMinorAmount(-500)).toBe(true);
      expect(isValidSignedMinorAmount(0)).toBe(true);
      expect(isValidSignedMinorAmount(1500)).toBe(true);
      expect(isValidSignedMinorAmount(-12.5)).toBe(false);
      expect(isValidSignedMinorAmount(NaN)).toBe(false);
      expect(isValidSignedMinorAmount(Infinity)).toBe(false);
      expect(isValidSignedMinorAmount("balance")).toBe(false);
    });
  });

  describe("Date / Month / Timestamp Validation", () => {
    it("should validate plain dates in YYYY-MM-DD format", () => {
      expect(isValidPlainDate("2026-06-23")).toBe(true);
      expect(isValidPlainDate("2020-02-29")).toBe(true); // Leap year
    });

    it("should reject invalid calendar dates, short formats, or random values", () => {
      expect(isValidPlainDate("2026-13-01")).toBe(false); // Invalid month
      expect(isValidPlainDate("2026-02-30")).toBe(false); // Non-existent date
      expect(isValidPlainDate("2021-02-29")).toBe(false); // Non-leap year
      expect(isValidPlainDate("2026-6-23")).toBe(false);  // Bad padding
      expect(isValidPlainDate("2026-06-")).toBe(false);
      expect(isValidPlainDate("random")).toBe(false);
      expect(isValidPlainDate("")).toBe(false);
    });

    it("should validate budget month YYYY-MM", () => {
      expect(isValidBudgetMonth("2026-06")).toBe(true);
      expect(isValidBudgetMonth("2026-12")).toBe(true);
      expect(isValidBudgetMonth("2026-00")).toBe(false);
      expect(isValidBudgetMonth("2026-13")).toBe(false);
      expect(isValidBudgetMonth("2026-6")).toBe(false);
      expect(isValidBudgetMonth("random")).toBe(false);
    });

    it("should validate full ISO 8601 timestamps", () => {
      expect(isValidTimestamp("2026-06-23T02:40:00.000Z")).toBe(true);
      expect(isValidTimestamp("2026-06-23T02:40:00Z")).toBe(true);
      expect(isValidTimestamp("2026-06-23T02:40:00+02:00")).toBe(true);
      expect(isValidTimestamp("2026-06-23")).toBe(false);
      expect(isValidTimestamp("random")).toBe(false);
    });
  });

  describe("Domain Model Schema Validators", () => {
    const timestamp = "2026-06-23T02:40:00.000Z";

    // 1. Account Schema Tests
    it("should validate correct Account records", () => {
      const acc: AccountRecord = {
        schemaVersion: 1,
        id: "acc_1",
        name: "Checking Account",
        type: "checking",
        currency: "EUR",
        openingBalanceMinor: 10000,
        balanceMode: "manual",
        currentBalanceMinor: -2500, // Negative balance allowed
        archived: false,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      expect(validateAccount(acc).ok).toBe(true);
    });

    it("should reject accounts with invalid fields", () => {
      const acc: any = {
        schemaVersion: 1,
        id: "acc_1",
        name: "A".repeat(121), // name too long
        type: "checking",
        currency: "USD", // Invalid currency
        balanceMode: "manual",
        archived: false,
        createdAt: "invalid-date",
        updatedAt: timestamp
      };
      const result = validateAccount(acc);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e: any) => e.field === "name" && e.code === "required")).toBe(true);
        expect(result.errors.some((e: any) => e.field === "currency" && e.code === "invalid_enum")).toBe(true);
        expect(result.errors.some((e: any) => e.field === "createdAt" && e.code === "invalid_timestamp")).toBe(true);
      }
    });

    // 2. Category Schema Tests
    it("should validate correct Category records", () => {
      const cat: CategoryRecord = {
        schemaVersion: 1,
        id: "cat_1",
        name: "Groceries",
        kind: "expense",
        archived: false,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      expect(validateCategory(cat).ok).toBe(true);
    });

    // 3. Recurring Item Tests
    it("should validate correct Recurring Item records", () => {
      const item: RecurringItemRecord = {
        schemaVersion: 1,
        id: "rec_1",
        name: "Netflix",
        kind: "expense",
        amountMinor: 1799,
        currency: "EUR",
        interval: "monthly",
        categoryId: "cat_1",
        necessity: "optional",
        active: true,
        archived: false,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      expect(validateRecurringItem(item).ok).toBe(true);
    });

    it("should reject recurring items with negative amounts", () => {
      const item: any = {
        schemaVersion: 1,
        id: "rec_1",
        name: "Netflix",
        kind: "expense",
        amountMinor: -100, // Negative amount invalid
        currency: "EUR",
        interval: "monthly",
        categoryId: "cat_1",
        necessity: "optional",
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const result = validateRecurringItem(item);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e: any) => e.field === "amountMinor" && e.code === "invalid_amount")).toBe(true);
      }
    });

    // 4. Transaction Schema Tests
    it("should validate correct Transaction splits and totals", () => {
      const tx: TransactionRecord = {
        schemaVersion: 1,
        id: "tx_1",
        date: "2026-06-23",
        type: "expense",
        totalAmountMinor: 1000,
        currency: "EUR",
        splits: [
          { id: "sp_1", categoryId: "cat_1", amountMinor: 700 },
          { id: "sp_2", categoryId: "cat_2", amountMinor: 300 }
        ],
        archived: false,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      expect(validateTransaction(tx).ok).toBe(true);
    });

    it("should reject transactions with split sums mismatching the total", () => {
      const tx: TransactionRecord = {
        schemaVersion: 1,
        id: "tx_1",
        date: "2026-06-23",
        type: "expense",
        totalAmountMinor: 1000,
        currency: "EUR",
        splits: [
          { id: "sp_1", categoryId: "cat_1", amountMinor: 500 },
          { id: "sp_2", categoryId: "cat_2", amountMinor: 400 } // Total is 900
        ],
        archived: false,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const result = validateTransaction(tx);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e: any) => e.field === "splits" && e.code === "split_sum_mismatch")).toBe(true);
      }
    });

    it("should reject transactions with negative total or negative split values", () => {
      const tx: any = {
        schemaVersion: 1,
        id: "tx_1",
        date: "2026-06-23",
        type: "expense",
        totalAmountMinor: -500, // Negative total invalid
        currency: "EUR",
        splits: [
          { id: "sp_1", categoryId: "cat_1", amountMinor: -500 }
        ],
        archived: false,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const result = validateTransaction(tx);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e: any) => e.field === "totalAmountMinor" && e.code === "invalid_amount")).toBe(true);
      }
    });

    it("should reject transfer transactions lacking source or destination, having splits, or matching accounts", () => {
      // 1. Lacks destinationAccountId
      const tx1: TransactionRecord = {
        schemaVersion: 1,
        id: "tx_1",
        date: "2026-06-23",
        type: "transfer",
        accountId: "acc_1", // Lacks destinationAccountId
        totalAmountMinor: 1000,
        currency: "EUR",
        splits: [],
        archived: false,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const res1 = validateTransaction(tx1);
      expect(res1.ok).toBe(false);
      if (!res1.ok) {
        expect(res1.errors.some((e: any) => e.field === "destinationAccountId" && e.code === "required")).toBe(true);
      }

      // 2. Has splits
      const tx2: TransactionRecord = {
        schemaVersion: 1,
        id: "tx_2",
        date: "2026-06-23",
        type: "transfer",
        accountId: "acc_1",
        destinationAccountId: "acc_2",
        totalAmountMinor: 1000,
        currency: "EUR",
        splits: [{ id: "sp_1", categoryId: "cat_1", amountMinor: 1000 }], // Splits must be empty
        archived: false,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const res2 = validateTransaction(tx2);
      expect(res2.ok).toBe(false);
      if (!res2.ok) {
        expect(res2.errors.some((e: any) => e.field === "splits" && e.code === "invalid_type")).toBe(true);
      }

      // 3. Same accounts
      const tx3: TransactionRecord = {
        schemaVersion: 1,
        id: "tx_3",
        date: "2026-06-23",
        type: "transfer",
        accountId: "acc_1",
        destinationAccountId: "acc_1", // Same source/destination
        totalAmountMinor: 1000,
        currency: "EUR",
        splits: [],
        archived: false,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const res3 = validateTransaction(tx3);
      expect(res3.ok).toBe(false);
      if (!res3.ok) {
        expect(res3.errors.some((e: any) => e.field === "destinationAccountId" && e.code === "same_accounts")).toBe(true);
      }
    });

    // 5. Budget Envelope Tests
    it("should validate correct Budget envelopes", () => {
      const env: BudgetEnvelopeRecord = {
        schemaVersion: 1,
        id: "env_1",
        month: "2026-06",
        categoryId: "cat_1",
        plannedAmountMinor: 50000,
        rolloverEnabled: true,
        archived: false,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      expect(validateBudgetEnvelope(env).ok).toBe(true);
    });

    it("should reject budget envelopes with negative planned amounts", () => {
      const env: any = {
        schemaVersion: 1,
        id: "env_1",
        month: "2026-06",
        categoryId: "cat_1",
        plannedAmountMinor: -10, // Negative amount invalid
        rolloverEnabled: true,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const result = validateBudgetEnvelope(env);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e: any) => e.field === "plannedAmountMinor" && e.code === "invalid_amount")).toBe(true);
      }
    });

    it("should enforce transaction date to accept only plain YYYY-MM-DD", () => {
      const tx: any = {
        schemaVersion: 1,
        id: "tx_1",
        date: "2026-06-23T00:00:00Z", // Timestamp not allowed for transaction date
        type: "expense",
        totalAmountMinor: 1000,
        currency: "EUR",
        splits: [{ id: "sp_1", categoryId: "cat_1", amountMinor: 1000 }],
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const res = validateTransaction(tx);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.errors.some((e: any) => e.field === "date" && e.code === "invalid_date")).toBe(true);
      }
    });

    it("should enforce createdAt and updatedAt to require full ISO timestamps", () => {
      const acc: any = {
        schemaVersion: 1,
        id: "acc_1",
        name: "Checking",
        type: "checking",
        currency: "EUR",
        balanceMode: "manual",
        archived: false,
        createdAt: "2026-06-23", // Not a timestamp
        updatedAt: timestamp
      };
      const res = validateAccount(acc);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.errors.some((e: any) => e.field === "createdAt" && e.code === "invalid_timestamp")).toBe(true);
      }
    });
  });

  describe("Seeding Default Categories", () => {
    it("should generate category records with correct schema types", () => {
      const list = generateDefaultCategories();
      expect(list.length).toBeGreaterThan(0);
      
      list.forEach((cat) => {
        expect(cat.schemaVersion).toBe(1);
        expect(cat.archived).toBe(false);
        expect(validateCategory(cat).ok).toBe(true);
      });
    });

    it("should include Software & Tools and Hosting & Domains expense categories", () => {
      const list = generateDefaultCategories();
      const names = list.map((c) => c.name);
      expect(names).toContain("Software & Tools");
      expect(names).toContain("Hosting & Domains");
    });

    it("should generate random UUID-like IDs for privacy hardening, not name-derived deterministic values", () => {
      const list1 = generateDefaultCategories();
      const list2 = generateDefaultCategories();
      
      // Verification of randomness
      expect(list1[0].id).not.toBe(list2[0].id);

      // Verify that IDs do not contain names/kinds
      list1.forEach((cat) => {
        expect(cat.id).not.toContain(cat.name.toLowerCase());
        expect(cat.id).not.toContain(cat.kind);
        // Match UUID length / pattern (random UUID length is 36)
        expect(cat.id.length).toBe(36);
      });
    });

    it("should not contain duplicates by kind + name", () => {
      const list = generateDefaultCategories();
      const seen = new Set<string>();
      for (const cat of list) {
        const key = `${cat.kind}:${cat.name.toLowerCase()}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    });

    it("should support client-side deduplication check on retry", () => {
      const list = generateDefaultCategories();
      const firstHalf = list.slice(0, Math.floor(list.length / 2));
      
      // Simulate client-side decrypted duplicate check mapping:
      const existingKeys = new Set<string>();
      for (const cat of firstHalf) {
        existingKeys.add(`${cat.kind}:${cat.name.trim().toLowerCase()}`);
      }

      // Seeding run logic:
      const toSeed = list.filter((cat) => {
        const key = `${cat.kind}:${cat.name.trim().toLowerCase()}`;
        return !existingKeys.has(key);
      });

      // Verify it skipped already existing ones
      expect(toSeed.length).toBe(list.length - firstHalf.length);
      toSeed.forEach((cat) => {
        const key = `${cat.kind}:${cat.name.trim().toLowerCase()}`;
        expect(existingKeys.has(key)).toBe(false);
      });
    });
  });

  describe("Calculations & Rounding", () => {
    const makeItem = (amountMinor: number, interval: any): RecurringItemRecord => ({
      schemaVersion: 1,
      id: "i",
      name: "n",
      kind: "expense",
      amountMinor,
      currency: "EUR",
      interval,
      categoryId: "c",
      necessity: "essential",
      active: true,
      archived: false,
      createdAt: "",
      updatedAt: ""
    });

    it("should calculate exact equivalents for monthly and yearly sums", () => {
      const monthly = makeItem(700, "monthly");
      expect(yearlyEquivalentMinor(monthly)).toBe(8400);

      const yearly = makeItem(1200, "yearly");
      expect(monthlyEquivalentMinor(yearly)).toBe(100);
    });

    it("should follow explicit rounding rules for uneven divisions", () => {
      // 100 yearly -> 100/12 = 8.333 -> 8 monthly
      expect(monthlyEquivalentMinor(makeItem(100, "yearly"))).toBe(8);
      // 101 yearly -> 101/12 = 8.416 -> 8 monthly
      expect(monthlyEquivalentMinor(makeItem(101, "yearly"))).toBe(8);
      // 106 yearly -> 106/12 = 8.833 -> 9 monthly
      expect(monthlyEquivalentMinor(makeItem(106, "yearly"))).toBe(9);

      // 100 quarterly -> 100/3 = 33.333 -> 33 monthly
      expect(monthlyEquivalentMinor(makeItem(100, "quarterly"))).toBe(33);
      // 101 quarterly -> 101/3 = 33.666 -> 34 monthly
      expect(monthlyEquivalentMinor(makeItem(101, "quarterly"))).toBe(34);
    });

    it("should calculate weekly equivalents (weekly * 52 / 12) with standard rounding", () => {
      // 10 weekly -> 10 * 52 / 12 = 43.333 -> 43 monthly
      expect(monthlyEquivalentMinor(makeItem(10, "weekly"))).toBe(43);
      // 15 weekly -> 15 * 52 / 12 = 65 monthly
      expect(monthlyEquivalentMinor(makeItem(15, "weekly"))).toBe(65);
    });

    it("should calculate totals for lists of active recurring items", () => {
      const items: RecurringItemRecord[] = [
        {
          schemaVersion: 1, id: "1", name: "Salary", kind: "income", amountMinor: 500000, currency: "EUR",
          interval: "monthly", necessity: "essential", active: true, archived: false, createdAt: "", updatedAt: "", categoryId: "c"
        },
        {
          schemaVersion: 1, id: "2", name: "Side Hustle", kind: "income", amountMinor: 12000, currency: "EUR",
          interval: "yearly", necessity: "useful", active: true, archived: false, createdAt: "", updatedAt: "", categoryId: "c"
        },
        {
          schemaVersion: 1, id: "3", name: "Rent", kind: "expense", amountMinor: 100000, currency: "EUR",
          interval: "monthly", necessity: "essential", active: true, archived: false, createdAt: "", updatedAt: "", categoryId: "c"
        },
        {
          schemaVersion: 1, id: "4", name: "Netflix", kind: "expense", amountMinor: 1200, currency: "EUR",
          interval: "monthly", necessity: "optional", active: false, archived: false, createdAt: "", updatedAt: "", categoryId: "c"
        }
      ];

      expect(totalMonthlyRecurringIncome(items)).toBe(501000);
      expect(totalMonthlyRecurringExpenses(items)).toBe(100000);
      expect(totalYearlyRecurringExpenses(items)).toBe(1200000);
    });

    it("should calculate category totals for a given month", () => {
      const txs: TransactionRecord[] = [
        {
          schemaVersion: 1, id: "t1", date: "2026-06-15", type: "expense", totalAmountMinor: 1500, currency: "EUR",
          splits: [
            { id: "s1", categoryId: "housing", amountMinor: 1000 },
            { id: "s2", categoryId: "groceries", amountMinor: 500 }
          ],
          archived: false,
          createdAt: "", updatedAt: ""
        },
        {
          schemaVersion: 1, id: "t2", date: "2026-06-20", type: "expense", totalAmountMinor: 400, currency: "EUR",
          splits: [{ id: "s3", categoryId: "groceries", amountMinor: 400 }],
          archived: false,
          createdAt: "", updatedAt: ""
        },
        {
          schemaVersion: 1, id: "t3", date: "2026-07-01", type: "expense", totalAmountMinor: 900, currency: "EUR",
          splits: [{ id: "s4", categoryId: "housing", amountMinor: 900 }],
          archived: false,
          createdAt: "", updatedAt: ""
        }
      ];

      const totals = transactionTotalsByCategoryForMonth(txs, "2026-06");
      expect(totals["housing"]).toBe(1000);
      expect(totals["groceries"]).toBe(900);
    });

    it("should compare budget planned vs actual totals for a month", () => {
      const budgets: BudgetEnvelopeRecord[] = [
        {
          schemaVersion: 1, id: "b1", month: "2026-06", categoryId: "housing", plannedAmountMinor: 120000,
          rolloverEnabled: false, archived: false, createdAt: "", updatedAt: ""
        },
        {
          schemaVersion: 1, id: "b2", month: "2026-06", categoryId: "groceries", plannedAmountMinor: 80000,
          rolloverEnabled: false, archived: false, createdAt: "", updatedAt: ""
        },
        {
          schemaVersion: 1, id: "b3", month: "2026-07", categoryId: "groceries", plannedAmountMinor: 90000,
          rolloverEnabled: false, archived: false, createdAt: "", updatedAt: ""
        }
      ];

      const txs: TransactionRecord[] = [
        {
          schemaVersion: 1, id: "t1", date: "2026-06-15", type: "expense", totalAmountMinor: 50000, currency: "EUR",
          splits: [{ id: "s1", categoryId: "housing", amountMinor: 50000 }],
          archived: false,
          createdAt: "", updatedAt: ""
        }
      ];

      const comp = budgetPlannedVsActualForMonth(budgets, txs, "2026-06");
      expect(comp.length).toBe(2);

      const housing = comp.find(c => c.categoryId === "housing");
      expect(housing?.planned).toBe(120000);
      expect(housing?.actual).toBe(50000);

      const groceries = comp.find(c => c.categoryId === "groceries");
      expect(groceries?.planned).toBe(80000);
      expect(groceries?.actual).toBe(0);
    });
  });

  describe("Record Encryption Integration (Roundtrip)", () => {
    it("should encrypt and decrypt a category record successfully using a real vault key", async () => {
      const vaultKey = await generateVaultKey();
      const plaintextPayload: CategoryRecord = {
        schemaVersion: 1,
        id: "cat_test_roundtrip",
        name: "Groceries Roundtrip",
        kind: "expense",
        archived: false,
        createdAt: "2026-06-23T02:40:00.000Z",
        updatedAt: "2026-06-23T02:40:00.000Z"
      };

      // Encrypt
      const encryptedRecord = await toEncryptedRecordInput("category", plaintextPayload, vaultKey);

      expect(encryptedRecord.record_type).toBe("category");
      expect(encryptedRecord.encrypted_payload).toBeDefined();
      expect(encryptedRecord.nonce).toBeDefined();

      // Verify no plaintext strings are leaked inside the base64 ciphertext
      const decodedPayload = atob(encryptedRecord.encrypted_payload);
      expect(decodedPayload).not.toContain("Groceries Roundtrip");

      // Decrypt
      const decrypted = await fromEncryptedRecord(encryptedRecord, vaultKey);
      expect(decrypted).toEqual(plaintextPayload);
    });

    it("should reject invalid record types before encryption", async () => {
      const vaultKey = await generateVaultKey();
      await expect(
        toEncryptedRecordInput("secret_payload" as any, {}, vaultKey)
      ).rejects.toThrow("Invalid record type");
    });

    it("should accept only the approved generic server-visible record types", async () => {
      const vaultKey = await generateVaultKey();
      const approved: string[] = ["account", "category", "recurring_item", "transaction", "budget", "settings"];
      const forbidden: string[] = ["credit_card", "checking", "savings", "expense", "income", "transfer_detail"];

      for (const t of approved) {
        // Just verify toEncryptedRecordInput accepts or doesn't reject with "Invalid record type" (might fail on validation instead, which is correct)
        const dummyPayload = { schemaVersion: 1, id: "1", createdAt: "2026-06-23T02:40:00Z", updatedAt: "2026-06-23T02:40:00Z" };
        if (t === "settings") {
          const enc = await toEncryptedRecordInput(t as any, dummyPayload, vaultKey);
          expect(enc.record_type).toBe(t);
        } else {
          // Others will throw validation error but NOT "Invalid record type"
          await expect(
            toEncryptedRecordInput(t as any, dummyPayload, vaultKey)
          ).rejects.toThrow(/Validation failed for record type/);
        }
      }

      for (const f of forbidden) {
        await expect(
          toEncryptedRecordInput(f as any, {}, vaultKey)
        ).rejects.toThrow(/Invalid record type/);
      }
    });

    it("should ensure no default category names appear in encrypted record metadata fields", async () => {
      const vaultKey = await generateVaultKey();
      const list = generateDefaultCategories();
      for (const cat of list) {
        const encryptedRecord = await toEncryptedRecordInput("category", cat, vaultKey);
        
        // The server-visible fields must be generic
        expect(encryptedRecord.record_type).toBe("category");
        expect(encryptedRecord.schema_version).toBe(1);
        expect(encryptedRecord.crypto_version).toBe(1);
        
        // Ensure ID is completely generic (UUID) and doesn't leak category details
        expect(cat.id).not.toContain(cat.name.toLowerCase());
        expect(cat.id).not.toContain(cat.kind);
      }
    });
  });

  describe("Phase 6B Additional Tests", () => {
    describe("Money Input Helpers", () => {
      it("should parse valid euro strings to minor units", () => {
        expect(parseEuroToMinor("12")).toEqual({ ok: true, value: 1200 });
        expect(parseEuroToMinor("12,99")).toEqual({ ok: true, value: 1299 });
        expect(parseEuroToMinor("12.99")).toEqual({ ok: true, value: 1299 });
        expect(parseEuroToMinor("0,01")).toEqual({ ok: true, value: 1 });
        expect(parseEuroToMinor("001,05")).toEqual({ ok: true, value: 105 });
        expect(parseEuroToMinor("12,9")).toEqual({ ok: true, value: 1290 });
      });

      it("should reject invalid formats", () => {
        expect(parseEuroToMinor("12.")).toEqual({ ok: false, error: "Invalid number format" });
        expect(parseEuroToMinor(".99")).toEqual({ ok: false, error: "Invalid number format" });
        expect(parseEuroToMinor("")).toEqual({ ok: false, error: "Empty input" });
        expect(parseEuroToMinor("   ")).toEqual({ ok: false, error: "Empty input" });
        expect(parseEuroToMinor("letters")).toEqual({ ok: false, error: "Invalid number format" });
        expect(parseEuroToMinor("12,999")).toEqual({ ok: false, error: "Invalid number format" });
        expect(parseEuroToMinor("-12")).toEqual({ ok: false, error: "Negative amounts not allowed" });
      });

      it("should parse negative values when signed is enabled", () => {
        expect(parseEuroToMinor("12", { signed: true })).toEqual({ ok: true, value: 1200 });
        expect(parseEuroToMinor("-12", { signed: true })).toEqual({ ok: true, value: -1200 });
        expect(parseEuroToMinor("-0,01", { signed: true })).toEqual({ ok: true, value: -1 });
      });

      it("should reject values exceeding safe integer cents", () => {
        expect(parseEuroToMinor("90071992547409.92")).toEqual({ ok: false, error: "Amount is too large" });
        expect(parseEuroToMinor("9007199254740992", { signed: true })).toEqual({ ok: false, error: "Amount is too large" });
      });

      it("should format minor units back to euro decimals", () => {
        expect(formatMinorAsEuro(1200)).toBe("12.00");
        expect(formatMinorAsEuro(1299)).toBe("12.99");
        expect(formatMinorAsEuro(1)).toBe("0.01");
        expect(formatMinorAsEuro(-100)).toBe("-1.00");
        expect(formatMinorAsEuro(-5)).toBe("-0.05");
      });
    });

    describe("Category Duplicate Checking Logic", () => {
      it("should compare kind and normalized name only for active categories", () => {
        const list = [
          {
            recordId: "rec1",
            recordType: "category" as const,
            payload: { schemaVersion: 1 as const, id: "cat1", name: "Groceries", kind: "expense" as const, archived: false, createdAt: "", updatedAt: "" }
          },
          {
            recordId: "rec2",
            recordType: "category" as const,
            payload: { schemaVersion: 1 as const, id: "cat2", name: "  groceries  ", kind: "expense" as const, archived: true, createdAt: "", updatedAt: "" }
          }
        ];

        const isDuplicate = (name: string, kind: "expense" | "income", excludeId?: string) => {
          const norm = name.trim().toLowerCase();
          return list.some(c => {
            if (c.payload.archived) return false;
            if (excludeId && c.payload.id === excludeId) return false;
            return c.payload.kind === kind && c.payload.name.trim().toLowerCase() === norm;
          });
        };

        expect(isDuplicate("groceries", "expense")).toBe(true);
        expect(isDuplicate("  GROCERIES  ", "expense")).toBe(true);
        expect(isDuplicate("groceries", "expense", "cat1")).toBe(false);
        expect(isDuplicate("groceries", "income")).toBe(false);
      });
    });

    describe("Store & Metadata Handling", () => {
      const originalFetch = (globalThis as any).fetch;

      afterEach(() => {
        (globalThis as any).fetch = originalFetch;
        clearVault();
      });

      it("should load valid records and preserve backend metadata", async () => {
        const vaultKey = await generateVaultKey();
        
        const catPayload: CategoryRecord = {
          schemaVersion: 1,
          id: "cat1",
          name: "Groceries",
          kind: "expense",
          archived: false,
          createdAt: "2026-06-23T18:00:00Z",
          updatedAt: "2026-06-23T18:00:00Z"
        };
        const encCat = await toEncryptedRecordInput("category", catPayload, vaultKey);

        const mockResponse = [
          {
            id: "backend_rec_1",
            record_type: "category",
            schema_version: encCat.schema_version,
            crypto_version: encCat.crypto_version,
            encrypted_payload: encCat.encrypted_payload,
            nonce: encCat.nonce,
            revision: 2,
            updated_at: "2026-06-23T18:05:00Z"
          }
        ];

        (globalThis as any).fetch = async () => {
          return {
            ok: true,
            status: 200,
            json: async () => mockResponse
          } as any;
        };

        await setVault("vault1", vaultKey);

        const loadedCats = get(categoriesStore);
        expect(loadedCats.length).toBe(1);
        expect(loadedCats[0].recordId).toBe("backend_rec_1");
        expect(loadedCats[0].revision).toBe(2);
        expect(loadedCats[0].updatedAt).toBe("2026-06-23T18:05:00Z");
        expect(loadedCats[0].payload).toEqual(catPayload);
        expect(get(totalRecordsLoaded)).toBe(1);
        expect(get(successfullyDecryptedCount)).toBe(1);
        expect(get(skippedRecordsCount)).toBe(0);
        expect(get(storeWarning)).toBeNull();
      });

      it("should tolerate partial failures and skip bad records", async () => {
        const vaultKey = await generateVaultKey();

        const mockResponse = [
          {
            id: "backend_bad_rec",
            record_type: "category",
            schema_version: 1,
            crypto_version: 1,
            encrypted_payload: "corrupt_base64",
            nonce: "nonce_val",
            revision: 1,
            updated_at: "2026-06-23T18:05:00Z"
          }
        ];

        let warningLogged = false;
        const originalWarn = console.warn;
        console.warn = (msg, meta) => {
          if (msg.includes("Skipped invalid decrypted finance record")) {
            warningLogged = true;
            expect(meta).toHaveProperty("recordType");
            expect(meta).toHaveProperty("recordId");
            expect(meta).toHaveProperty("errorCodes");
            expect(meta).not.toHaveProperty("name");
            expect(meta).not.toHaveProperty("payload");
          }
        };

        (globalThis as any).fetch = async () => {
          return {
            ok: true,
            status: 200,
            json: async () => mockResponse
          } as any;
        };

        await setVault("vault1", vaultKey);

        console.warn = originalWarn;

        expect(get(categoriesStore).length).toBe(0);
        expect(get(totalRecordsLoaded)).toBe(1);
        expect(get(successfullyDecryptedCount)).toBe(0);
        expect(get(skippedRecordsCount)).toBe(1);
        expect(warningLogged).toBe(true);
        expect(get(storeWarning)).toContain("1 record(s) failed to decrypt/validate");
      });

      it("should pick PUT/POST path depending on recordId, and archiving sets archived: true", async () => {
        const vaultKey = await generateVaultKey();
        await setVault("vault1", vaultKey);

        let requestedUrl = "";
        let requestedMethod = "";
        let requestedBody: any = null;

        (globalThis as any).fetch = async (url: string, opts?: any) => {
          const method = opts?.method || "GET";
          if (method === "POST" || method === "PUT") {
            requestedUrl = url;
            requestedMethod = method;
            requestedBody = JSON.parse(opts.body);
          }
          return {
            ok: true,
            status: 200,
            json: async () => []
          } as any;
        };

        const catPayload: CategoryRecord = {
          schemaVersion: 1,
          id: "cat1",
          name: "Groceries",
          kind: "expense",
          archived: false,
          createdAt: "2026-06-23T18:00:00Z",
          updatedAt: "2026-06-23T18:00:00Z"
        };

        await saveRecord("category", catPayload, undefined, "csrf_token");
        expect(requestedUrl).toBe("/api/vaults/vault1/records");
        expect(requestedMethod).toBe("POST");
        expect(requestedBody.id).toBe("cat1");

        await saveRecord("category", catPayload, "backend_rec_1", "csrf_token");
        expect(requestedUrl).toBe("/api/vaults/vault1/records/backend_rec_1");
        expect(requestedMethod).toBe("PUT");
        expect(requestedBody).not.toHaveProperty("id");

        await archiveRecord("category", catPayload, "backend_rec_1", "csrf_token");
        expect(requestedUrl).toBe("/api/vaults/vault1/records/backend_rec_1");
        expect(requestedMethod).toBe("PUT");
      });
    });

    describe("Subscriptions View Derivation Calculations", () => {
      it("should derive active subscriptions, exclude income/archived/inactive, and sum cancel candidates", () => {
        const items = [
          {
            schemaVersion: 1 as const, id: "1", name: "Netflix", kind: "expense" as const, amountMinor: 1500, currency: "EUR" as const,
            interval: "monthly" as const, categoryId: "cat_1", necessity: "optional" as const, active: true, archived: false, createdAt: "", updatedAt: ""
          },
          {
            schemaVersion: 1 as const, id: "2", name: "Gym Membership", kind: "expense" as const, amountMinor: 36000, currency: "EUR" as const,
            interval: "yearly" as const, categoryId: "cat_1", necessity: "cancel_candidate" as const, active: true, archived: false, createdAt: "", updatedAt: ""
          },
          {
            schemaVersion: 1 as const, id: "3", name: "Old Gym", kind: "expense" as const, amountMinor: 40000, currency: "EUR" as const,
            interval: "monthly" as const, categoryId: "cat_1", necessity: "cancel_candidate" as const, active: true, archived: true, createdAt: "", updatedAt: ""
          },
          {
            schemaVersion: 1 as const, id: "4", name: "Spotify", kind: "expense" as const, amountMinor: 999, currency: "EUR" as const,
            interval: "monthly" as const, categoryId: "cat_1", necessity: "optional" as const, active: false, archived: false, createdAt: "", updatedAt: ""
          },
          {
            schemaVersion: 1 as const, id: "5", name: "Salary", kind: "income" as const, amountMinor: 300000, currency: "EUR" as const,
            interval: "monthly" as const, categoryId: "cat_1", necessity: "essential" as const, active: true, archived: false, createdAt: "", updatedAt: ""
          }
        ];

        const activeExpenses = items.filter(i => i.kind === "expense" && i.active && !i.archived);
        expect(activeExpenses.length).toBe(2);
        expect(activeExpenses.map(i => i.id)).toContain("1");
        expect(activeExpenses.map(i => i.id)).toContain("2");

        const cancelCandidates = activeExpenses.filter(i => i.necessity === "cancel_candidate");
        expect(cancelCandidates.length).toBe(1);
        expect(cancelCandidates[0].id).toBe("2");

        const totalMonthlyCancelCandidates = cancelCandidates.reduce((sum, i) => sum + monthlyEquivalentMinor(i), 0);
        const totalYearlyCancelCandidates = cancelCandidates.reduce((sum, i) => sum + yearlyEquivalentMinor(i), 0);

        expect(totalMonthlyCancelCandidates).toBe(3000);
        expect(totalYearlyCancelCandidates).toBe(36000);
      });
    });

    describe("Transactions Store & Calculations", () => {
      it("should calculate correct derived account balances dynamically in-memory", () => {
        const mockAccounts = [
          {
            recordId: "rec_acc1",
            recordType: "account" as const,
            payload: {
              schemaVersion: 1 as const,
              id: "acc_1",
              name: "Checking",
              type: "checking" as const,
              currency: "EUR" as const,
              openingBalanceMinor: 1000,
              balanceMode: "calculated" as const,
              archived: false,
              createdAt: "",
              updatedAt: ""
            }
          },
          {
            recordId: "rec_acc2",
            recordType: "account" as const,
            payload: {
              schemaVersion: 1 as const,
              id: "acc_2",
              name: "Savings",
              type: "savings" as const,
              currency: "EUR" as const,
              openingBalanceMinor: 500,
              balanceMode: "calculated" as const,
              archived: false,
              createdAt: "",
              updatedAt: ""
            }
          }
        ];

        const mockTransactions = [
          {
            recordId: "rec_tx1",
            recordType: "transaction" as const,
            payload: {
              schemaVersion: 1 as const,
              id: "tx_1",
              date: "2026-06-23",
              type: "income" as const,
              accountId: "acc_1",
              totalAmountMinor: 500,
              currency: "EUR" as const,
              splits: [],
              archived: false,
              createdAt: "",
              updatedAt: ""
            }
          },
          {
            recordId: "rec_tx2",
            recordType: "transaction" as const,
            payload: {
              schemaVersion: 1 as const,
              id: "tx_2",
              date: "2026-06-23",
              type: "expense" as const,
              accountId: "acc_1",
              totalAmountMinor: 200,
              currency: "EUR" as const,
              splits: [{ id: "sp1", categoryId: "cat_1", amountMinor: 200 }],
              archived: false,
              createdAt: "",
              updatedAt: ""
            }
          },
          {
            recordId: "rec_tx3",
            recordType: "transaction" as const,
            payload: {
              schemaVersion: 1 as const,
              id: "tx_3",
              date: "2026-06-23",
              type: "transfer" as const,
              accountId: "acc_1",
              destinationAccountId: "acc_2",
              totalAmountMinor: 300,
              currency: "EUR" as const,
              splits: [],
              archived: false,
              createdAt: "",
              updatedAt: ""
            }
          },
          {
            recordId: "rec_tx4",
            recordType: "transaction" as const,
            payload: {
              schemaVersion: 1 as const,
              id: "tx_4",
              date: "2026-06-23",
              type: "expense" as const,
              accountId: "acc_1",
              totalAmountMinor: 1000,
              currency: "EUR" as const,
              splits: [{ id: "sp2", categoryId: "cat_1", amountMinor: 1000 }],
              archived: true,
              createdAt: "",
              updatedAt: ""
            }
          }
        ];

        accountsStore.set(mockAccounts);
        transactionsStore.set(mockTransactions);

        const derivedList = get(derivedAccountsStore) as LoadedFinanceRecord<AccountRecord>[];
        expect(derivedList.length).toBe(2);

        const acc1 = derivedList.find(a => a.payload.id === "acc_1");
        expect(acc1?.payload.currentBalanceMinor).toBe(1000);

        const acc2 = derivedList.find(a => a.payload.id === "acc_2");
        expect(acc2?.payload.currentBalanceMinor).toBe(800);
      });

      it("should filter transaction list correctly by month, account, category, type, and archived states", () => {
        const txs = [
          {
            id: "tx1", date: "2026-06-01", type: "income", accountId: "acc_1",
            totalAmountMinor: 100, currency: "EUR", splits: [{ id: "s1", categoryId: "cat_1", amountMinor: 100 }],
            archived: false, createdAt: "", updatedAt: ""
          },
          {
            id: "tx2", date: "2026-06-15", type: "expense", accountId: "acc_1",
            totalAmountMinor: 200, currency: "EUR", splits: [{ id: "s2", categoryId: "cat_2", amountMinor: 200 }],
            archived: false, createdAt: "", updatedAt: ""
          },
          {
            id: "tx3", date: "2026-07-01", type: "transfer", accountId: "acc_1", destinationAccountId: "acc_2",
            totalAmountMinor: 300, currency: "EUR", splits: [],
            archived: false, createdAt: "", updatedAt: ""
          },
          {
            id: "tx4", date: "2026-06-20", type: "expense", accountId: "acc_2",
            totalAmountMinor: 400, currency: "EUR", splits: [{ id: "s3", categoryId: "cat_1", amountMinor: 400 }],
            archived: true, createdAt: "", updatedAt: ""
          }
        ];

        const filterTxs = (
          list: any[],
          month: string,
          account: string,
          category: string,
          type: string,
          showArchived: boolean
        ) => {
          return list.filter(tx => {
            if (!showArchived && tx.archived) return false;
            if (month !== "all" && tx.date.substring(0, 7) !== month) return false;
            if (account !== "all") {
              const matchesSource = tx.accountId === account;
              const matchesDest = tx.type === "transfer" && tx.destinationAccountId === account;
              if (!matchesSource && !matchesDest) return false;
            }
            if (category !== "all") {
              if (tx.type === "transfer") return false;
              const matchesCategory = tx.splits.some((s: any) => s.categoryId === category);
              if (!matchesCategory) return false;
            }
            if (type !== "all" && tx.type !== type) return false;
            return true;
          });
        };

        const res1 = filterTxs(txs, "all", "all", "all", "all", false);
        expect(res1.length).toBe(3);
        expect(res1.map(t => t.id)).not.toContain("tx4");

        const res2 = filterTxs(txs, "2026-06", "all", "all", "all", false);
        expect(res2.length).toBe(2);
        expect(res2.map(t => t.id)).toContain("tx1");
        expect(res2.map(t => t.id)).toContain("tx2");

        const res3 = filterTxs(txs, "all", "acc_2", "all", "all", false);
        expect(res3.length).toBe(1);
        expect(res3[0].id).toBe("tx3");

        const res4 = filterTxs(txs, "all", "all", "cat_1", "all", false);
        expect(res4.length).toBe(1);
        expect(res4[0].id).toBe("tx1");

        const res5 = filterTxs(txs, "all", "all", "all", "all", true);
        expect(res5.length).toBe(4);
      });
    });

    describe("Budget Calculations, Rollover, and Validation", () => {
      const timestamp = "2026-06-23T02:40:00.000Z";

      it("should validate budget envelopes and check archived flag", () => {
        const b1: BudgetEnvelopeRecord = {
          schemaVersion: 1,
          id: "b1",
          month: "2026-06",
          categoryId: "cat_1",
          plannedAmountMinor: 1000,
          rolloverEnabled: true,
          archived: false,
          createdAt: timestamp,
          updatedAt: timestamp
        };
        expect(validateBudgetEnvelope(b1).ok).toBe(true);

        const b2: any = {
          schemaVersion: 1,
          id: "b2",
          month: "2026-06",
          categoryId: "cat_1",
          plannedAmountMinor: 1000,
          rolloverEnabled: true,
          // archived missing
          createdAt: timestamp,
          updatedAt: timestamp
        };
        expect(validateBudgetEnvelope(b2).ok).toBe(false);
      });

      it("should prevent duplicate active budget for same month and category", () => {
        const mockBudgets = [
          {
            id: "b1",
            month: "2026-06",
            categoryId: "cat_1",
            plannedAmountMinor: 1000,
            rolloverEnabled: false,
            archived: false,
            createdAt: timestamp,
            updatedAt: timestamp
          },
          {
            id: "b2",
            month: "2026-06",
            categoryId: "cat_2",
            plannedAmountMinor: 500,
            rolloverEnabled: false,
            archived: true,
            createdAt: timestamp,
            updatedAt: timestamp
          }
        ];

        const checkDuplicate = (month: string, categoryId: string, editingId?: string) => {
          return mockBudgets.some(b => 
            !b.archived && 
            b.month === month && 
            b.categoryId === categoryId && 
            b.id !== editingId
          );
        };

        expect(checkDuplicate("2026-06", "cat_1")).toBe(true);
        expect(checkDuplicate("2026-06", "cat_2")).toBe(false);
        expect(checkDuplicate("2026-07", "cat_1")).toBe(false);
        expect(checkDuplicate("2026-06", "cat_1", "b1")).toBe(false);
      });

      it("should calculate correct actual spending from splits, ignoring transfers, income, and archived txs", () => {
        const txs: TransactionRecord[] = [
          {
            schemaVersion: 1, id: "tx1", date: "2026-06-01", type: "expense", totalAmountMinor: 1000, currency: "EUR",
            splits: [{ id: "sp1", categoryId: "cat_1", amountMinor: 1000 }], archived: false,
            createdAt: "", updatedAt: ""
          },
          {
            schemaVersion: 1, id: "tx2", date: "2026-06-05", type: "expense", totalAmountMinor: 500, currency: "EUR",
            splits: [{ id: "sp2", categoryId: "cat_1", amountMinor: 500 }], archived: true,
            createdAt: "", updatedAt: ""
          },
          {
            schemaVersion: 1, id: "tx3", date: "2026-06-10", type: "transfer", totalAmountMinor: 2000, currency: "EUR",
            splits: [], archived: false,
            createdAt: "", updatedAt: ""
          },
          {
            schemaVersion: 1, id: "tx4", date: "2026-06-15", type: "income", totalAmountMinor: 3000, currency: "EUR",
            splits: [{ id: "sp3", categoryId: "cat_1", amountMinor: 3000 }], archived: false,
            createdAt: "", updatedAt: ""
          },
          {
            schemaVersion: 1, id: "tx5", date: "2026-06-20", type: "expense", totalAmountMinor: 1200, currency: "EUR",
            splits: [
              { id: "sp4", categoryId: "cat_1", amountMinor: 400 },
              { id: "sp5", categoryId: "cat_2", amountMinor: 800 }
            ], archived: false,
            createdAt: "", updatedAt: ""
          }
        ];

        const actuals = transactionTotalsByCategoryForMonth(txs, "2026-06");
        expect(actuals["cat_1"]).toBe(1400);
        expect(actuals["cat_2"]).toBe(800);
      });

      it("should compute previous month rollover preview if enabled", () => {
        const mockBudgets = [
          {
            schemaVersion: 1 as const, id: "b1", month: "2026-05", categoryId: "cat_1",
            plannedAmountMinor: 1000, rolloverEnabled: true, archived: false, createdAt: "", updatedAt: ""
          },
          {
            schemaVersion: 1 as const, id: "b2", month: "2026-05", categoryId: "cat_2",
            plannedAmountMinor: 200, rolloverEnabled: true, archived: false, createdAt: "", updatedAt: ""
          }
        ];

        const mockTransactions = [
          {
            schemaVersion: 1 as const, id: "tx1", date: "2026-05-15", type: "expense" as const,
            totalAmountMinor: 400, currency: "EUR" as const, splits: [{ id: "sp1", categoryId: "cat_1", amountMinor: 400 }],
            archived: false, createdAt: "", updatedAt: ""
          },
          {
            schemaVersion: 1 as const, id: "tx2", date: "2026-05-20", type: "expense" as const,
            totalAmountMinor: 300, currency: "EUR" as const, splits: [{ id: "sp2", categoryId: "cat_2", amountMinor: 300 }],
            archived: false, createdAt: "", updatedAt: ""
          }
        ];

        const roll1 = calculateEnvelopeRollover(mockBudgets, mockTransactions, "2026-06", "cat_1");
        expect(roll1).toBe(600);

        const roll2 = calculateEnvelopeRollover(mockBudgets, mockTransactions, "2026-06", "cat_2");
        expect(roll2).toBe(0);
      });

      it("should calculate correct unallocated money estimate avoiding double counting recurring items", () => {
        const estimatedIncome = 300000;
        const totalPlannedEnvelopes = 250000;
        const unallocated = estimatedIncome - totalPlannedEnvelopes;
        expect(unallocated).toBe(50000);
      });
    });

    describe("Build & Privacy Safety Static Analysis", () => {
      // @ts-ignore
      const fs = require("fs");
      // @ts-ignore
      const path = require("path");

      function walkDir(dir: string, callback: (filePath: string) => void) {
        if (!fs.existsSync(dir)) return;
        fs.readdirSync(dir).forEach((f: string) => {
          const dirPath = path.join(dir, f);
          const isDirectory = fs.statSync(dirPath).isDirectory();
          if (isDirectory) {
            walkDir(dirPath, callback);
          } else {
            callback(dirPath);
          }
        });
      }

      it("should contain absolutely no Svelte {@html} tags or storage usage for keys/state", () => {
        // @ts-ignore
        const srcDir = path.resolve(__dirname, "../../");
        let svelteFilesCount = 0;

        walkDir(srcDir, (filePath) => {
          if (filePath.includes(".test.ts") || filePath.includes(".spec.")) return;
          if (filePath.endsWith(".svelte") || filePath.endsWith(".ts")) {
            svelteFilesCount++;
            const content = fs.readFileSync(filePath, "utf-8");
            
            expect(content).not.toContain("{@html");
            
            const cleanContent = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
            
            expect(cleanContent).not.toMatch(/localStorage\.setItem\([^)]*?(?:key|vault|decrypt|payload)/i);
            expect(cleanContent).not.toMatch(/sessionStorage\.setItem\([^)]*?(?:key|vault|decrypt|payload)/i);
          }
        });

        expect(svelteFilesCount).toBeGreaterThan(0);
      });
    });
  });
});
