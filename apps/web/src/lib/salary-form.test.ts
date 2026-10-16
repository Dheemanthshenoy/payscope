import { describe, expect, it } from "vitest";
import {
  buildCorrectSalaryRevision,
  buildCreateSalaryRevision,
  formatAmountMinorAsMajorInput,
} from "./salary-form";

describe("buildCreateSalaryRevision", () => {
  it("converts major units to an integer minor-unit string without floats", () => {
    const result = buildCreateSalaryRevision({
      amount: "145000.50",
      currencyCode: "USD",
      effectiveOn: "2026-03-01",
      reason: "offer",
    });
    expect(result.errors).toEqual({});
    expect(result.payload).toEqual({
      amountMinor: "14500050",
      currencyCode: "USD",
      effectiveOn: "2026-03-01",
      reason: "offer",
    });
    expect(formatAmountMinorAsMajorInput("14500050")).toBe("145000.50");
  });

  it("keeps exact two-decimal money such as 0.01 and 1200000.00", () => {
    expect(buildCreateSalaryRevision({
      amount: "0.01",
      currencyCode: "INR",
      effectiveOn: "2026-01-15",
      reason: "",
    }).payload?.amountMinor).toBe("1");
    expect(buildCreateSalaryRevision({
      amount: "1200000.00",
      currencyCode: "INR",
      effectiveOn: "2026-01-15",
      reason: "",
    }).payload?.amountMinor).toBe("120000000");
  });

  it("rejects invalid amount, currency, and calendar dates", () => {
    const result = buildCreateSalaryRevision({
      amount: "1000.567",
      currencyCode: "JPY",
      effectiveOn: "2026-02-31",
      reason: "",
    });
    expect(result.payload).toBeUndefined();
    expect(result.errors.amount).toMatch(/two decimal/i);
    expect(result.errors.currencyCode).toMatch(/INR/);
    expect(result.errors.effectiveOn).toMatch(/UTC date/);
  });

  it("omits an empty create reason", () => {
    const result = buildCreateSalaryRevision({
      amount: "10",
      currencyCode: "EUR",
      effectiveOn: "2026-10-15",
      reason: "   ",
    });
    expect(result.payload?.reason).toBeUndefined();
  });
});

describe("buildCorrectSalaryRevision", () => {
  it("requires a reason and sends expectedVersion", () => {
    const missing = buildCorrectSalaryRevision(
      { amount: "90000.00", currencyCode: "AED", effectiveOn: "2023-06-01", reason: "" },
      3,
    );
    expect(missing.payload).toBeUndefined();
    expect(missing.errors.reason).toMatch(/reason/i);

    const result = buildCorrectSalaryRevision(
      { amount: "90000.00", currencyCode: "AED", effectiveOn: "2023-06-01", reason: "legacy correction" },
      3,
    );
    expect(result.payload).toEqual({
      amountMinor: "9000000",
      currencyCode: "AED",
      reason: "legacy correction",
      expectedVersion: 3,
    });
  });
});
