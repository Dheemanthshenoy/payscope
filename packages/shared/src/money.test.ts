import { describe, expect, it } from "vitest";
import {
  AmountMinorSchema,
  EffectiveOnSchema,
  formatAmountMinor,
  parseAmountMinor,
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
