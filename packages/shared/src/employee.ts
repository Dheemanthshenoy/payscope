import { z } from "zod";
import { PaginationQuerySchema } from "./pagination.js";
import {
  AmountMinorSchema,
  CurrencyCodeSchema,
  EffectiveOnSchema,
  looksLikeSpreadsheetFormula,
} from "./money.js";

export const EmployeeNumberSchema = z
  .string()
  .trim()
  .min(1, "Employee number is required")
  .max(64)
  .refine((value) => !looksLikeSpreadsheetFormula(value), "Employee number looks like a spreadsheet formula");

export const EmployeeFullNameSchema = z
  .string()
  .trim()
  .min(1, "Full name is required")
  .max(200)
  .refine((value) => !looksLikeSpreadsheetFormula(value), "Full name looks like a spreadsheet formula");

export const CreateEmployeeSchema = z.object({
  employeeNumber: EmployeeNumberSchema,
  fullName: EmployeeFullNameSchema,
  departmentId: z.uuid(),
  countryId: z.uuid(),
  isActive: z.boolean().optional().default(true),
});

export type CreateEmployee = z.infer<typeof CreateEmployeeSchema>;

export const UpdateEmployeeSchema = z
  .object({
    fullName: EmployeeFullNameSchema,
    departmentId: z.uuid(),
    countryId: z.uuid(),
  })
  .strict();

export type UpdateEmployee = z.infer<typeof UpdateEmployeeSchema>;

export const EmployeeProfileSnapshotSchema = z.object({
  employeeNumber: z.string(),
  fullName: z.string(),
  departmentId: z.uuid(),
  countryId: z.uuid(),
  isActive: z.boolean(),
});

export type EmployeeProfileSnapshot = z.infer<typeof EmployeeProfileSnapshotSchema>;

export const EmployeeStatusSchema = z.enum(["active", "inactive", "all"]).default("active");

const employeeFilters = {
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  departmentId: z.uuid().optional(),
  countryId: z.uuid().optional(),
  status: EmployeeStatusSchema,
};

export const EmployeeFilterQuerySchema = z.object(employeeFilters);
export type EmployeeFilterQuery = z.infer<typeof EmployeeFilterQuerySchema>;

export const EmployeeListQuerySchema = PaginationQuerySchema.extend(employeeFilters);
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
