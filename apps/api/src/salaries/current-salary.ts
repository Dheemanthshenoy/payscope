import { Prisma } from "@prisma/client";
import { formatAmountMinor, formatEffectiveOn } from "@payscope/shared";
import { prisma } from "../db/prisma.js";

export type CurrentSalaryRow = {
  id: string;
  employeeId: string;
  amountMinor: string;
  currencyCode: string;
  effectiveOn: string;
  reason: string | null;
  version: number;
};

type RawCurrentSalary = {
  id: string;
  employee_id: string;
  amount_minor: bigint;
  currency_code: string;
  effective_on: Date;
  reason: string | null;
  version: number;
};

export async function findCurrentSalaries(
  employeeIds: string[],
): Promise<Map<string, CurrentSalaryRow>> {
  const result = new Map<string, CurrentSalaryRow>();
  if (employeeIds.length === 0) {
    return result;
  }

  const rows = await prisma.$queryRaw<RawCurrentSalary[]>`
    SELECT DISTINCT ON (employee_id)
      id,
      employee_id,
      amount_minor,
      currency_code,
      effective_on,
      reason,
      version
    FROM salary_revisions
    WHERE employee_id IN (${Prisma.join(
      employeeIds.map((id) => Prisma.sql`${id}::uuid`),
    )})
      AND effective_on <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
    ORDER BY employee_id, effective_on DESC
  `;

  for (const row of rows) {
    result.set(row.employee_id, {
      id: row.id,
      employeeId: row.employee_id,
      amountMinor: formatAmountMinor(row.amount_minor),
      currencyCode: row.currency_code.trim(),
      effectiveOn: formatEffectiveOn(row.effective_on),
      reason: row.reason,
      version: row.version,
    });
  }
  return result;
}
