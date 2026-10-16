import { describe, expect, it } from "vitest";
import { snapshotText } from "./audit-snapshot";

describe("snapshotText", () => {
  it("formats salary snapshots as money and effective date", () => {
    expect(
      snapshotText({
        amountMinor: "5100050",
        currencyCode: "INR",
        effectiveOn: "2027-06-01",
        reason: "correction",
        version: 2,
      }),
    ).toBe("INR 51,000.50 · 2027-06-01");
  });

  it("formats identity snapshots as employee number and name", () => {
    expect(
      snapshotText({
        employeeNumber: "E-8B-100",
        fullName: "New Nina",
        departmentId: "11111111-1111-4111-8111-111111111111",
        countryId: "22222222-2222-4222-8222-222222222222",
        isActive: true,
      }),
    ).toBe("E-8B-100 · New Nina");
  });

  it("returns an em dash for empty values", () => {
    expect(snapshotText(null)).toBe("—");
    expect(snapshotText({})).toBe("—");
  });
});
