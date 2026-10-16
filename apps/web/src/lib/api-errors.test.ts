import { describe, expect, it } from "vitest";
import { ApiClientError } from "./api";
import { csvConflictRows, csvRowErrors, mutationErrorMessage } from "./api-errors";

describe("mutationErrorMessage", () => {
  it("maps 400, 401, 403, and 409 to useful copy", () => {
    expect(mutationErrorMessage(new ApiClientError(400, "VALIDATION", "Invalid request"))).toBe(
      "Invalid request",
    );
    expect(mutationErrorMessage(new ApiClientError(401, "UNAUTHENTICATED", "Authentication required"))).toMatch(
      /session expired/i,
    );
    expect(mutationErrorMessage(new ApiClientError(403, "CSRF", "Untrusted origin"))).toMatch(/origin/i);
    expect(
      mutationErrorMessage(new ApiClientError(409, "CONFLICT", "Salary revision was updated by someone else")),
    ).toBe("Salary revision was updated by someone else");
  });
});

describe("csv error details", () => {
  it("reads row-level validation errors from details.rows", () => {
    expect(
      csvRowErrors({
        rows: [{ rowNumber: 2, field: "amount", message: "amount must be a major-unit decimal" }],
      }),
    ).toEqual([{ rowNumber: 2, field: "amount", message: "amount must be a major-unit decimal" }]);
  });

  it("reads 409 import conflict rows", () => {
    expect(
      csvConflictRows({
        rows: [{ employeeNumber: "SEED-00001", effectiveOn: "2026-06-17", message: "stale version" }],
      }),
    ).toEqual([{ employeeNumber: "SEED-00001", effectiveOn: "2026-06-17", message: "stale version" }]);
  });
});
