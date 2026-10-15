import { describe, expect, it } from "vitest";
import { csvHeaderIndex, parseCsv, serializeCsvRow } from "./csv.js";

describe("csv", () => {
  it("parses quoted fields and serializes formula-safe output", () => {
    const rows = parseCsv('employee_number,full_name\n"E-1","Smith, Ann"\n');
    expect(rows[1]).toEqual(["E-1", "Smith, Ann"]);
    expect(serializeCsvRow(["=1+1", 'say "hi"'])).toBe(`"'=1+1","say ""hi"""`);
  });

  it("requires the canonical header", () => {
    expect(() => csvHeaderIndex(["employee_number", "full_name"])).toThrow(/missing/);
  });
});
