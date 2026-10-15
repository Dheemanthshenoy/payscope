import { z } from "zod";

export const CURRENCY_CODES = ["INR", "USD", "GBP", "AED", "EUR"] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export const CurrencyCodeSchema = z.enum(CURRENCY_CODES);

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
