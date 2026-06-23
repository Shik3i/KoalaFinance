import { encryptRecordPayload, decryptRecordPayload } from "../crypto";
import {
  validateAccount,
  validateCategory,
  validateRecurringItem,
  validateTransaction,
  validateBudgetEnvelope
} from "./validators";
import type { FinanceRecordType, ValidationResult, ValidationError } from "./types";

const APPROVED_RECORD_TYPES: FinanceRecordType[] = [
  "account",
  "category",
  "recurring_item",
  "transaction",
  "budget",
  "settings"
];

function getValidator(recordType: FinanceRecordType): (payload: any) => ValidationResult {
  switch (recordType) {
    case "account":
      return validateAccount;
    case "category":
      return validateCategory;
    case "recurring_item":
      return validateRecurringItem;
    case "transaction":
      return validateTransaction;
    case "budget":
      return validateBudgetEnvelope;
    case "settings":
      return () => ({ ok: true }); // Settings has flexible layout
    default:
      return () => ({ ok: false, errors: [{ field: "record_type", code: "invalid_type", message: "Unknown record type" }] });
  }
}

/**
 * Validates and encrypts a plaintext finance domain payload.
 * Rejects unapproved record types before encryption.
 * Returns the object ready for Go backend API submission.
 */
export async function toEncryptedRecordInput(
  recordType: FinanceRecordType,
  plaintextPayload: any,
  vaultKey: CryptoKey
): Promise<any> {
  // 1. Strict record type check
  if (!APPROVED_RECORD_TYPES.includes(recordType)) {
    throw new Error(`Invalid record type: "${recordType}". Financial records must use approved types only.`);
  }

  // 2. Validate payload
  const validator = getValidator(recordType);
  const valResult = validator(plaintextPayload);
  if (!valResult.ok) {
    const errorDetails = valResult.errors.map((e: ValidationError) => `${e.field} [${e.code}]: ${e.message}`).join("; ");
    throw new Error(`Validation failed for record type "${recordType}": ${errorDetails}`);
  }

  // 3. Encrypt payload
  const schemaVersion = plaintextPayload.schemaVersion || 1;
  const envelope = await encryptRecordPayload(plaintextPayload, vaultKey, schemaVersion);

  return {
    record_type: recordType,
    schema_version: envelope.schemaVersion,
    crypto_version: envelope.cryptoVersion,
    encrypted_payload: envelope.payload,
    nonce: envelope.nonce
  };
}

/**
 * Decrypts and validates an encrypted database record envelope.
 * Throws if the decrypted contents fail the schema validator.
 */
export async function fromEncryptedRecord(
  encryptedRecord: any,
  vaultKey: CryptoKey
): Promise<any> {
  const recordType = encryptedRecord.record_type as FinanceRecordType;
  
  if (!APPROVED_RECORD_TYPES.includes(recordType)) {
    throw new Error(`Invalid record type: "${recordType}"`);
  }

  // 1. Decrypt envelope
  const envelope = {
    cryptoVersion: encryptedRecord.crypto_version,
    algorithm: "AES-GCM-256",
    nonce: encryptedRecord.nonce,
    payload: encryptedRecord.encrypted_payload,
    schemaVersion: encryptedRecord.schema_version
  };

  const plaintextPayload = await decryptRecordPayload(envelope, vaultKey);

  // 2. Validate decrypted content
  const validator = getValidator(recordType);
  const valResult = validator(plaintextPayload);
  if (!valResult.ok) {
    const errorDetails = valResult.errors.map((e: ValidationError) => `${e.field} [${e.code}]: ${e.message}`).join("; ");
    throw new Error(`Database record validation failed for decrypted type "${recordType}": ${errorDetails}`);
  }

  return plaintextPayload;
}
