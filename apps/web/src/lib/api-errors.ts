import { CsvConflictDetailsSchema, CsvRowErrorSchema, type CsvRowError } from "@payscope/shared";
import { z } from "zod";
import { ApiClientError } from "@/lib/api";

export function isConflictError(err: unknown): boolean {
  return err instanceof ApiClientError && (err.status === 409 || err.code === "CONFLICT");
}

export function mutationErrorMessage(err: unknown): string {
  if (!(err instanceof ApiClientError)) {
    return "Something went wrong. Try again.";
  }
  if (err.status === 401 || err.code === "UNAUTHENTICATED") {
    return "Your session expired. Sign in again.";
  }
  if (err.status === 403 || err.code === "CSRF") {
    return "This request was blocked by origin checks. Reload the page and try again.";
  }
  if (err.status === 409 || err.code === "CONFLICT") {
    return err.message || "This record changed. Refresh and try again.";
  }
  if (err.status === 400 || err.code === "VALIDATION" || err.code === "CSV_INVALID") {
    return err.message || "Check the values and try again.";
  }
  return err.message || "Request failed.";
}

export function csvRowErrors(details: unknown): CsvRowError[] {
  const parsed = z.object({ rows: z.array(CsvRowErrorSchema) }).safeParse(details);
  return parsed.success ? parsed.data.rows : [];
}

export function csvConflictRows(details: unknown) {
  const parsed = CsvConflictDetailsSchema.safeParse(details);
  return parsed.success ? parsed.data.rows : [];
}
