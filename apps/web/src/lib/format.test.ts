import { describe, expect, it } from "vitest";
import { formatMoney } from "./format";

describe("formatMoney", () => {
  it("formats minor units with currency and grouping", () => {
    expect(formatMoney("120000050", "INR")).toBe("INR 1,200,000.50");
    expect(formatMoney("0", "USD")).toBe("USD 0.00");
  });
});
