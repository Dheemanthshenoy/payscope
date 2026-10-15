import { z } from "zod";
import { looksLikeSpreadsheetFormula } from "./money.js";

export const CSV_HEADERS = [
  "employee_number",
  "full_name",
  "department",
  "country",
  "is_active",
  "effective_on",
  "amount",
  "currency_code",
  "reason",
] as const;

export type CsvHeader = (typeof CSV_HEADERS)[number];

export const CsvRowErrorSchema = z.object({
  rowNumber: z.number().int().positive(),
  field: z.string(),
  message: z.string(),
});

export type CsvRowError = z.infer<typeof CsvRowErrorSchema>;

export const CsvImportSuccessSchema = z.object({
  imported: z.object({
    employees: z.number().int().nonnegative(),
    revisions: z.number().int().nonnegative(),
  }),
});

export type CsvImportSuccess = z.infer<typeof CsvImportSuccessSchema>;

export const CsvConflictDetailsSchema = z.object({
  rows: z.array(
    z.object({
      employeeNumber: z.string(),
      effectiveOn: z.string(),
      message: z.string(),
    }),
  ),
});

export const MAX_CSV_ROWS = 10_000;

export function quoteCsvField(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function guardCsvFormula(value: string): string {
  return looksLikeSpreadsheetFormula(value) ? `'${value}` : value;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const input = text.startsWith("\uFEFF") ? text.slice(1) : text;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i] ?? "";
    const next = input[i + 1] ?? "";
    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (char === "\r") {
      continue;
    }
    field += char;
  }

  if (inQuotes) {
    throw new Error("CSV has an unterminated quoted field");
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((value) => value.trim() !== ""));
}

export function csvHeaderIndex(headerRow: string[]): Map<CsvHeader, number> {
  const normalized = headerRow.map((value) => value.trim().toLowerCase());
  const index = new Map<CsvHeader, number>();
  for (const name of CSV_HEADERS) {
    const at = normalized.indexOf(name);
    if (at === -1) {
      throw new Error(`CSV header is missing "${name}"`);
    }
    index.set(name, at);
  }
  const unknown = normalized.filter((name) => !CSV_HEADERS.includes(name as CsvHeader) && name !== "");
  if (unknown.length > 0) {
    throw new Error(`CSV header has unknown columns: ${unknown.join(", ")}`);
  }
  return index;
}

export function serializeCsvRow(values: string[]): string {
  return values.map((value) => quoteCsvField(guardCsvFormula(value))).join(",");
}
