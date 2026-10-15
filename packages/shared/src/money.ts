import { z } from "zod";

export const CURRENCY_CODES = ["INR", "USD", "GBP", "AED", "EUR"] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export const CurrencyCodeSchema = z.enum(CURRENCY_CODES);

/** All MVP currencies use ISO 4217 exponent 2. Never convert money with Number(). */
export const CURRENCY_EXPONENT = 2;
export const MINOR_UNITS_PER_MAJOR = 100n;

const FORMULA_PREFIX = new Set(["=", "+", "-", "@", "\t", "\r"]);

export function looksLikeSpreadsheetFormula(value: string): boolean {
  if (value.length === 0) return false;
  const first = value[0];
  return first !== undefined && FORMULA_PREFIX.has(first);
}

/** Integer minor units as a decimal digit string. Never parse with Number(). */
export const AmountMinorSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, "amountMinor must be a non-negative integer string");

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isUtcDateOnly(value: string): boolean {
  const match = DATE_ONLY.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export const EffectiveOnSchema = z
  .string()
  .regex(DATE_ONLY, "effectiveOn must be YYYY-MM-DD")
  .refine(isUtcDateOnly, "effectiveOn must be a valid calendar date");

export function parseAmountMinor(value: string): bigint {
  return BigInt(value);
}

export function formatAmountMinor(value: bigint): string {
  return value.toString(10);
}

export function parseEffectiveOn(value: string): Date {
  const match = DATE_ONLY.exec(value);
  if (!match || !isUtcDateOnly(value)) {
    throw new Error("Invalid effectiveOn");
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function formatEffectiveOn(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function utcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const MAJOR_AMOUNT = /^(0|[1-9]\d*)(\.\d{1,2})?$/;

/**
 * Parse a major-unit decimal string into integer minor units.
 * Accepts at most two fraction digits. Never uses floating-point.
 */
export function parseMajorToMinor(value: string): bigint {
  const trimmed = value.trim();
  if (!MAJOR_AMOUNT.test(trimmed)) {
    throw new Error("amount must be a non-negative major-unit decimal with at most 2 places");
  }
  const [whole = "0", fraction = ""] = trimmed.split(".");
  const padded = fraction.padEnd(CURRENCY_EXPONENT, "0");
  return BigInt(whole) * MINOR_UNITS_PER_MAJOR + BigInt(padded);
}

export function formatMinorAsMajor(amountMinor: bigint): string {
  const whole = amountMinor / MINOR_UNITS_PER_MAJOR;
  const fraction = amountMinor % MINOR_UNITS_PER_MAJOR;
  return `${whole.toString(10)}.${fraction.toString(10).padStart(CURRENCY_EXPONENT, "0")}`;
}

function incrementDecimalInteger(value: string): string {
  const digits = value.split("");
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    if (digits[i] !== "9") {
      digits[i] = String(Number(digits[i]) + 1);
      return digits.join("");
    }
    digits[i] = "0";
  }
  return `1${digits.join("")}`;
}

/**
 * Round a non-negative NUMERIC string to an integer (half away from zero).
 * Used only at the API presentation boundary for average/median minor units.
 */
export function roundHalfAwayFromZeroInteger(numeric: string): string {
  const trimmed = numeric.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("numeric value must be a non-negative decimal string");
  }
  const [integer = "0", fraction = ""] = trimmed.split(".");
  if (fraction.length === 0 || /^0+$/.test(fraction)) {
    return integer.replace(/^0+(?=\d)/, "") || "0";
  }
  const first = fraction[0] ?? "0";
  const rest = fraction.slice(1);
  const exactHalf = first === "5" && (rest.length === 0 || /^0+$/.test(rest));
  const greaterThanHalf = first > "5" || (first === "5" && /[1-9]/.test(rest));
  const rounded = exactHalf || greaterThanHalf ? incrementDecimalInteger(integer) : integer;
  return rounded.replace(/^0+(?=\d)/, "") || "0";
}

export function numericToDecimalString(value: unknown): string {
  if (value == null) {
    throw new Error("numeric value is required");
  }
  if (typeof value === "bigint") {
    return value.toString(10);
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "object" && "toFixed" in value && typeof value.toFixed === "function") {
    return String(value);
  }
  if (typeof value === "object" && typeof value.toString === "function") {
    return value.toString();
  }
  throw new Error("numeric value must not be coerced through floating-point");
}

export const MajorAmountSchema = z
  .string()
  .trim()
  .refine((value) => MAJOR_AMOUNT.test(value), "amount must be a major-unit decimal with at most 2 places");
