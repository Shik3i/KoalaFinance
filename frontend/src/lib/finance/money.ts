// Money utilities using integer minor units (cents)

/**
 * Checks if a value is a valid non-negative minor unit money amount.
 * Rejects: floats, negative values, NaN, Infinity, unsafe integers, and non-number types.
 */
export function isValidMinorAmount(value: any): boolean {
  if (typeof value !== "number") return false;
  if (!Number.isInteger(value)) return false;
  if (!Number.isSafeInteger(value)) return false;
  if (value < 0) return false;
  return true;
}

/**
 * Checks if a value is a valid signed minor unit money amount (e.g., for balances).
 * Rejects: floats, NaN, Infinity, unsafe integers, and non-number types.
 */
export function isValidSignedMinorAmount(value: any): boolean {
  if (typeof value !== "number") return false;
  if (!Number.isInteger(value)) return false;
  if (!Number.isSafeInteger(value)) return false;
  return true;
}
