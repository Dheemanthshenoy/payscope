import { z } from "zod";
import { AmountMinorSchema, CurrencyCodeSchema, EffectiveOnSchema } from "./money.js";

export const CreateSalaryRevisionSchema = z.object({
  amountMinor: AmountMinorSchema,
  currencyCode: CurrencyCodeSchema,
  effectiveOn: EffectiveOnSchema,
  reason: z.string().trim().max(500).optional(),
});

export type CreateSalaryRevision = z.infer<typeof CreateSalaryRevisionSchema>;

export const CorrectSalaryRevisionSchema = z.object({
  amountMinor: AmountMinorSchema,
  currencyCode: CurrencyCodeSchema,
  reason: z.string().trim().min(1).max(500),
  expectedVersion: z.number().int().positive(),
});

export type CorrectSalaryRevision = z.infer<typeof CorrectSalaryRevisionSchema>;

export const SalaryRevisionSchema = z.object({
  id: z.uuid(),
  employeeId: z.uuid(),
  amountMinor: AmountMinorSchema,
  currencyCode: CurrencyCodeSchema,
  effectiveOn: EffectiveOnSchema,
  reason: z.string().nullable(),
  version: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SalaryRevisionDto = z.infer<typeof SalaryRevisionSchema>;

export const SalarySnapshotSchema = z.object({
  amountMinor: AmountMinorSchema,
  currencyCode: CurrencyCodeSchema,
  effectiveOn: EffectiveOnSchema,
  reason: z.string().nullable(),
  version: z.number().int().positive(),
});

export type SalarySnapshot = z.infer<typeof SalarySnapshotSchema>;

export const AUDIT_ACTIONS = [
  "SALARY_CREATE",
  "SALARY_CORRECT",
  "SALARY_IMPORT_CREATE",
  "SALARY_IMPORT_CORRECT",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
