import { describe, expect, it } from "vitest";
import {
  AmountMinorSchema,
  EffectiveOnSchema,
  formatAmountMinor,
  formatMinorAsMajor,
  looksLikeSpreadsheetFormula,
  parseAmountMinor,
  parseMajorToMinor,
  roundHalfAwayFromZeroInteger,
  utcToday,
} from "./money.js";

describe("amountMinor", () => {
  it("accepts integer strings and rejects negatives or decimals", () => {
    expect(parseAmountMinor(AmountMinorSchema.parse("0"))).toBe(0n);
    expect(formatAmountMinor(parseAmountMinor("100050"))).toBe("100050");
    expect(AmountMinorSchema.safeParse("-1").success).toBe(false);
    expect(AmountMinorSchema.safeParse("10.5").success).toBe(false);
    expect(AmountMinorSchema.safeParse("1e2").success).toBe(false);
  });
});

describe("effectiveOn", () => {
  it("accepts real UTC calendar dates only", () => {
    expect(EffectiveOnSchema.parse("2026-01-31")).toBe("2026-01-31");
    expect(EffectiveOnSchema.safeParse("2026-02-31").success).toBe(false);
    expect(EffectiveOnSchema.safeParse("2026/01/15").success).toBe(false);
  });
});

describe("utcToday", () => {
  it("returns a UTC midnight date", () => {
    const today = utcToday();
    expect(today.getUTCHours()).toBe(0);
    expect(today.getUTCMinutes()).toBe(0);
    expect(today.getUTCSeconds()).toBe(0);
  });
});

describe("major-unit money", () => {
  it("parses exact decimals without floating-point", () => {
    expect(parseMajorToMinor("1000")).toBe(100000n);
    expect(parseMajorToMinor("1000.5")).toBe(100050n);
    expect(parseMajorToMinor("1000.50")).toBe(100050n);
    expect(formatMinorAsMajor(100050n)).toBe("1000.50");
    expect(() => parseMajorToMinor("1000.567")).toThrow();
    expect(() => parseMajorToMinor("1e2")).toThrow();
    expect(() => parseMajorToMinor("-1")).toThrow();
  });

  it("rounds half away from zero using decimal strings", () => {
    expect(roundHalfAwayFromZeroInteger("150.5")).toBe("151");
    expect(roundHalfAwayFromZeroInteger("150.4999")).toBe("150");
    expect(roundHalfAwayFromZeroInteger("200")).toBe("200");
    expect(roundHalfAwayFromZeroInteger("0.5")).toBe("1");
  });

  it("detects spreadsheet formula prefixes", () => {
    expect(looksLikeSpreadsheetFormula("=cmd")).toBe(true);
    expect(looksLikeSpreadsheetFormula("+123")).toBe(true);
    expect(looksLikeSpreadsheetFormula("Alice")).toBe(false);
  });
});
