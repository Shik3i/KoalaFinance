// Money utilities using integer minor units (cents)

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

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

/**
 * Parses a string representing a decimal currency amount in Euros to integer minor units (cents).
 * Rejects numbers with more than 2 decimal places, invalid characters, or out-of-bounds inputs.
 */
export function parseEuroToMinor(input: string, options?: { signed?: boolean }): ParseResult<number> {
  const signed = options?.signed ?? false;
  const clean = input.trim();
  if (!clean) {
    return { ok: false, error: "Empty input" };
  }

  // Regex checks for optional sign (if signed is enabled), digits, and optional decimal portion (comma or dot)
  // Max 2 decimal places: e.g. .99, .9, .09, ,99 etc.
  const regex = signed
    ? /^(-)?\s*(\d+)(?:[.,](\d{1,2}))?$/
    : /^\s*(\d+)(?:[.,](\d{1,2}))?$/;

  const match = clean.match(regex);
  if (!match) {
    // If it has a negative sign but signed option is false, give a custom error
    if (!signed && clean.startsWith("-")) {
      return { ok: false, error: "Negative amounts not allowed" };
    }
    return { ok: false, error: "Invalid number format" };
  }

  let isNegative = false;
  let eurosStr = "";
  let centsStr = "";

  if (signed) {
    isNegative = !!match[1];
    eurosStr = match[2];
    centsStr = match[3] || "";
  } else {
    eurosStr = match[1];
    centsStr = match[2] || "";
  }

  const euros = parseInt(eurosStr, 10);
  const cents = centsStr ? parseInt(centsStr.padEnd(2, "0"), 10) : 0;

  const totalCents = euros * 100 + cents;
  const finalValue = isNegative ? -totalCents : totalCents;

  if (!Number.isSafeInteger(finalValue)) {
    return { ok: false, error: "Amount is too large" };
  }

  return { ok: true, value: finalValue };
}

/**
 * Formats minor integer units (cents) into a standard decimal string (e.g. 12.99 or -120.50).
 */
export function formatMinorAsEuro(amountMinor: number): string {
  const isNegative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  const euros = Math.floor(abs / 100);
  const cents = abs % 100;
  const sign = isNegative ? "-" : "";
  return `${sign}${euros}.${cents.toString().padStart(2, "0")}`;
}
