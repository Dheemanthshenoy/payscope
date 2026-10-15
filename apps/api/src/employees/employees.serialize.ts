import type { Country, Department, Employee, SalaryRevision } from "@prisma/client";
import {
  CurrencyCodeSchema,
  formatAmountMinor,
  formatEffectiveOn,
  type CurrentSalary,
  type EmployeeSummary,
} from "@payscope/shared";
import type { CurrentSalaryRow } from "../salaries/current-salary.js";

export function serializeCurrentSalary(row: CurrentSalaryRow): CurrentSalary {
  return {
    id: row.id,
    amountMinor: row.amountMinor,
    currencyCode: CurrencyCodeSchema.parse(row.currencyCode),
    effectiveOn: row.effectiveOn,
    reason: row.reason,
    version: row.version,
  };
}

export function serializeRevision(revision: SalaryRevision) {
  return {
    id: revision.id,
    employeeId: revision.employeeId,
    amountMinor: formatAmountMinor(revision.amountMinor),
    currencyCode: CurrencyCodeSchema.parse(revision.currencyCode.trim()),
    effectiveOn: formatEffectiveOn(revision.effectiveOn),
    reason: revision.reason,
    version: revision.version,
    createdAt: revision.createdAt.toISOString(),
    updatedAt: revision.updatedAt.toISOString(),
  };
}

export function serializeEmployee(
  employee: Employee & { department: Department; country: Country },
  currentSalary: CurrentSalaryRow | undefined,
): EmployeeSummary {
  return {
    id: employee.id,
    employeeNumber: employee.employeeNumber,
    fullName: employee.fullName,
    department: { id: employee.department.id, name: employee.department.name },
    country: {
      id: employee.country.id,
      code: employee.country.code.trim(),
      name: employee.country.name,
    },
    isActive: employee.isActive,
    deactivatedAt: employee.deactivatedAt?.toISOString() ?? null,
    currentSalary: currentSalary ? serializeCurrentSalary(currentSalary) : null,
  };
}

export function salarySnapshot(revision: SalaryRevision) {
  return {
    amountMinor: formatAmountMinor(revision.amountMinor),
    currencyCode: CurrencyCodeSchema.parse(revision.currencyCode.trim()),
    effectiveOn: formatEffectiveOn(revision.effectiveOn),
    reason: revision.reason,
    version: revision.version,
  };
}
