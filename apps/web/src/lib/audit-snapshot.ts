import { EmployeeProfileSnapshotSchema, type SalarySnapshot } from "@payscope/shared";
import { formatMoney } from "@/lib/format";

export function snapshotText(value: unknown): string {
  if (!value || typeof value !== "object") return "—";
  const salary = value as Partial<SalarySnapshot>;
  if (typeof salary.amountMinor === "string" && typeof salary.currencyCode === "string") {
    return `${formatMoney(salary.amountMinor, salary.currencyCode)} · ${salary.effectiveOn ?? ""}`.trim();
  }
  const profile = EmployeeProfileSnapshotSchema.safeParse(value);
  if (profile.success) {
    return `${profile.data.employeeNumber} · ${profile.data.fullName}`;
  }
  return "—";
}
