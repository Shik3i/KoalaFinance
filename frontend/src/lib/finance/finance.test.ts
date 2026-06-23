import { describe, it, expect } from "vitest";
import { generateVaultKey } from "../crypto";
import { isValidMinorAmount, isValidSignedMinorAmount } from "./money";
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
  budgetPlannedVsActualForMonth
} from "./calculations";
import { toEncryptedRecordInput, fromEncryptedRecord } from "./records";
import type {
  AccountRecord,
  CategoryRecord,
  RecurringItemRecord,
  TransactionRecord,
  BudgetEnvelopeRecord
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
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const result = validateTransaction(tx);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e: any) => e.field === "totalAmountMinor" && e.code === "invalid_amount")).toBe(true);
      }
    });

    it("should reject transfer transactions lacking source or destination when one is set", () => {
      const tx: TransactionRecord = {
        schemaVersion: 1,
        id: "tx_1",
        date: "2026-06-23",
        type: "transfer",
        accountId: "acc_1", // Lacks destinationAccountId
        totalAmountMinor: 1000,
        currency: "EUR",
        splits: [{ id: "sp_1", categoryId: "cat_1", amountMinor: 1000 }],
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const result = validateTransaction(tx);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e: any) => e.field === "destinationAccountId" && e.code === "missing_transfer_destination")).toBe(true);
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
      const list = generateDefaultCategories("vault_12345678");
      expect(list.length).toBeGreaterThan(0);
      
      list.forEach((cat) => {
        expect(cat.schemaVersion).toBe(1);
        expect(cat.archived).toBe(false);
        expect(validateCategory(cat).ok).toBe(true);
      });
    });

    it("should include Software & Tools and Hosting & Domains expense categories", () => {
      const list = generateDefaultCategories("vault_12345678");
      const names = list.map((c) => c.name);
      expect(names).toContain("Software & Tools");
      expect(names).toContain("Hosting & Domains");
    });

    it("should generate deterministic IDs to prevent double seeding", () => {
      const list1 = generateDefaultCategories("vault_123");
      const list2 = generateDefaultCategories("vault_123");
      expect(list1[0].id).toBe(list2[0].id);

      const list3 = generateDefaultCategories("vault_abc");
      expect(list1[0].id).not.toBe(list3[0].id); // Unique per vault
    });

    it("should not contain duplicates by kind + name", () => {
      const list = generateDefaultCategories("vault_123");
      const seen = new Set<string>();
      for (const cat of list) {
        const key = `${cat.kind}:${cat.name.toLowerCase()}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
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
          interval: "monthly", necessity: "essential", active: true, createdAt: "", updatedAt: "", categoryId: "c"
        },
        {
          schemaVersion: 1, id: "2", name: "Side Hustle", kind: "income", amountMinor: 12000, currency: "EUR",
          interval: "yearly", necessity: "useful", active: true, createdAt: "", updatedAt: "", categoryId: "c"
        },
        {
          schemaVersion: 1, id: "3", name: "Rent", kind: "expense", amountMinor: 100000, currency: "EUR",
          interval: "monthly", necessity: "essential", active: true, createdAt: "", updatedAt: "", categoryId: "c"
        },
        {
          schemaVersion: 1, id: "4", name: "Netflix", kind: "expense", amountMinor: 1200, currency: "EUR",
          interval: "monthly", necessity: "optional", active: false, createdAt: "", updatedAt: "", categoryId: "c"
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
          createdAt: "", updatedAt: ""
        },
        {
          schemaVersion: 1, id: "t2", date: "2026-06-20", type: "expense", totalAmountMinor: 400, currency: "EUR",
          splits: [{ id: "s3", categoryId: "groceries", amountMinor: 400 }],
          createdAt: "", updatedAt: ""
        },
        {
          schemaVersion: 1, id: "t3", date: "2026-07-01", type: "expense", totalAmountMinor: 900, currency: "EUR",
          splits: [{ id: "s4", categoryId: "housing", amountMinor: 900 }],
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
          rolloverEnabled: false, createdAt: "", updatedAt: ""
        },
        {
          schemaVersion: 1, id: "b2", month: "2026-06", categoryId: "groceries", plannedAmountMinor: 80000,
          rolloverEnabled: false, createdAt: "", updatedAt: ""
        },
        {
          schemaVersion: 1, id: "b3", month: "2026-07", categoryId: "groceries", plannedAmountMinor: 90000,
          rolloverEnabled: false, createdAt: "", updatedAt: ""
        }
      ];

      const txs: TransactionRecord[] = [
        {
          schemaVersion: 1, id: "t1", date: "2026-06-15", type: "expense", totalAmountMinor: 50000, currency: "EUR",
          splits: [{ id: "s1", categoryId: "housing", amountMinor: 50000 }],
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
  });
});
