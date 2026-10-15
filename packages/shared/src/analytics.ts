import { z } from "zod";
import { AmountMinorSchema, CurrencyCodeSchema } from "./money.js";
import { CountrySummarySchema, DepartmentSummarySchema } from "./employee.js";

export const AnalyticsQuerySchema = z.object({
  departmentId: z.uuid().optional(),
  countryId: z.uuid().optional(),
  currencyCode: CurrencyCodeSchema.optional(),
});

export type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>;

export const CurrencyStatsSchema = z.object({
  currencyCode: CurrencyCodeSchema,
  compensatedEmployeeCount: z.number().int().nonnegative(),
  minimum: AmountMinorSchema.nullable(),
  maximum: AmountMinorSchema.nullable(),
  average: AmountMinorSchema.nullable(),
  median: AmountMinorSchema.nullable(),
  total: AmountMinorSchema,
});

export type CurrencyStats = z.infer<typeof CurrencyStatsSchema>;

export const DepartmentAnalyticsSchema = z.object({
  department: DepartmentSummarySchema,
  activeEmployeeCount: z.number().int().nonnegative(),
  compensatedEmployeeCount: z.number().int().nonnegative(),
  byCurrency: z.array(CurrencyStatsSchema),
});

export const CountryAnalyticsSchema = z.object({
  country: CountrySummarySchema,
  activeEmployeeCount: z.number().int().nonnegative(),
  compensatedEmployeeCount: z.number().int().nonnegative(),
  byCurrency: z.array(CurrencyStatsSchema),
});

export const CompensationAnalyticsSchema = z.object({
  byDepartment: z.array(DepartmentAnalyticsSchema),
  byCountry: z.array(CountryAnalyticsSchema),
});

export type CompensationAnalytics = z.infer<typeof CompensationAnalyticsSchema>;
