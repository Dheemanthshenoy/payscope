import { z } from "zod";
import { PaginationQuerySchema } from "./pagination.js";
import {
  AmountMinorSchema,
  CurrencyCodeSchema,
  EffectiveOnSchema,
} from "./money.js";

export const EmployeeStatusSchema = z.enum(["active", "inactive", "all"]).default("active");

export const EmployeeListQuerySchema = PaginationQuerySchema.extend({
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  departmentId: z.uuid().optional(),
  countryId: z.uuid().optional(),
  status: EmployeeStatusSchema,
});

export type EmployeeListQuery = z.infer<typeof EmployeeListQuerySchema>;

export const CurrentSalarySchema = z.object({
  id: z.uuid(),
  amountMinor: AmountMinorSchema,
  currencyCode: CurrencyCodeSchema,
  effectiveOn: EffectiveOnSchema,
  reason: z.string().nullable(),
  version: z.number().int().positive(),
});

export type CurrentSalary = z.infer<typeof CurrentSalarySchema>;

export const DepartmentSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
});

export const CountrySummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
});

export const EmployeeSummarySchema = z.object({
  id: z.uuid(),
  employeeNumber: z.string(),
  fullName: z.string(),
  department: DepartmentSummarySchema,
  country: CountrySummarySchema,
  isActive: z.boolean(),
  deactivatedAt: z.string().nullable(),
  currentSalary: CurrentSalarySchema.nullable(),
});

export type EmployeeSummary = z.infer<typeof EmployeeSummarySchema>;
