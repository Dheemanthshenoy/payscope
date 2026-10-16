import { describe, expect, it } from "vitest";
import { parseContentDispositionFilename, safeDownloadFilename } from "./csv-download";

describe("export filename", () => {
  it("prefers a safe server-provided CSV name", () => {
    expect(
      safeDownloadFilename(
        parseContentDispositionFilename('attachment; filename="payscope-employees.csv"'),
      ),
    ).toBe("payscope-employees.csv");
  });

  it("strips directories and rejects non-csv names", () => {
    expect(safeDownloadFilename("../secret.csv")).toBe("secret.csv");
    expect(safeDownloadFilename("payscope-employees.exe")).toBe("payscope-employees.csv");
    expect(safeDownloadFilename("ok_export-2026.csv")).toBe("ok_export-2026.csv");
  });
});
