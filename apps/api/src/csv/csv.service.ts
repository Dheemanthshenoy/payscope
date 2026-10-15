import { Prisma } from "@prisma/client";
import {
  CSV_HEADERS,
  CurrencyCodeSchema,
  ErrorCode,
  EffectiveOnSchema,
  MAX_CSV_ROWS,
  csvHeaderIndex,
  formatEffectiveOn,
  formatMinorAsMajor,
  looksLikeSpreadsheetFormula,
  parseCsv,
  parseEffectiveOn,
  parseMajorToMinor,
  serializeCsvRow,
  type CsvHeader,
  type CsvImportSuccess,
  type CsvRowError,
  type EmployeeFilterQuery,
} from "@payscope/shared";
import { prisma } from "../db/prisma.js";
import { AppError } from "../errors/app-error.js";
import { employeeListWhere } from "../employees/employees.service.js";
import { salarySnapshot } from "../employees/employees.serialize.js";
import { findCurrentSalaries } from "../salaries/current-salary.js";

const EXPORT_BATCH = 200;

export type ValidatedImportRow = {
  rowNumber: number;
  employeeNumber: string;
  fullName: string;
  departmentName: string;
  countryKey: string;
  isActive: boolean;
  departmentId: string;
  countryId: string;
  salary:
    | {
        effectiveOn: Date;
        effectiveOnText: string;
        amountMinor: bigint;
        currencyCode: string;
        reason: string | null;
      }
    | null;
};

export type ImportSnapshot = {
  employees: Map<
    string,
    { id: string; isActive: boolean; fullName: string; departmentId: string; countryId: string }
  >;
  revisions: Map<string, { id: string; version: number; amountMinor: bigint; currencyCode: string }>;
};

function revisionKey(employeeNumber: string, effectiveOn: string): string {
  return `${employeeNumber}\0${effectiveOn}`;
}

function parseActive(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "active"].includes(normalized)) return true;
  if (["false", "0", "no", "inactive"].includes(normalized)) return false;
  return null;
}

function cell(row: string[], index: Map<CsvHeader, number>, name: CsvHeader): string {
  return (row[index.get(name) ?? -1] ?? "").trim();
}

function reject(errors: CsvRowError[]): never {
  throw new AppError(400, ErrorCode.CSV_INVALID, "CSV file is invalid", { rows: errors });
}

export function validateImportCsv(
  text: string,
  lookups: {
    departments: Map<string, { id: string; name: string }>;
    countriesByName: Map<string, { id: string; code: string; name: string }>;
    countriesByCode: Map<string, { id: string; code: string; name: string }>;
  },
  maxRows: number,
): ValidatedImportRow[] {
  let rows: string[][];
  try {
    rows = parseCsv(text);
  } catch (err) {
    reject([{ rowNumber: 1, field: "file", message: err instanceof Error ? err.message : "Malformed CSV" }]);
  }
  if (rows.length === 0) {
    reject([{ rowNumber: 1, field: "file", message: "CSV is empty" }]);
  }

  let index: Map<CsvHeader, number>;
  try {
    index = csvHeaderIndex(rows[0] ?? []);
  } catch (err) {
    reject([{ rowNumber: 1, field: "header", message: err instanceof Error ? err.message : "Invalid header" }]);
  }

  const dataRows = rows.slice(1);
  if (dataRows.length === 0) {
    reject([{ rowNumber: 2, field: "file", message: "CSV has no data rows" }]);
  }
  if (dataRows.length > maxRows) {
    reject([{ rowNumber: 1, field: "file", message: `CSV exceeds ${maxRows} data rows` }]);
  }

  const errors: CsvRowError[] = [];
  const seenNumbers = new Map<string, number>();
  const seenPairs = new Map<string, number>();
  const validated: ValidatedImportRow[] = [];

  dataRows.forEach((row, offset) => {
    const rowNumber = offset + 2;
    const push = (field: string, message: string) => {
      errors.push({ rowNumber, field, message });
    };

    const employeeNumber = cell(row, index, "employee_number");
    const fullName = cell(row, index, "full_name");
    const departmentName = cell(row, index, "department");
    const countryKey = cell(row, index, "country");
    const activeText = cell(row, index, "is_active");
    const effectiveOnText = cell(row, index, "effective_on");
    const amountText = cell(row, index, "amount");
    const currencyText = cell(row, index, "currency_code");
    const reasonText = cell(row, index, "reason");

    for (const [field, value] of [
      ["employee_number", employeeNumber],
      ["full_name", fullName],
      ["department", departmentName],
      ["country", countryKey],
      ["reason", reasonText],
    ] as const) {
      if (value && looksLikeSpreadsheetFormula(value)) {
        push(field, "Value looks like a spreadsheet formula");
      }
    }

    if (!employeeNumber) push("employee_number", "Employee number is required");
    if (!fullName) push("full_name", "Full name is required");
    const department = lookups.departments.get(departmentName.toLowerCase());
    if (!departmentName) push("department", "Department is required");
    else if (!department) push("department", "Unknown department");
    const country =
      lookups.countriesByName.get(countryKey.toLowerCase()) ??
      lookups.countriesByCode.get(countryKey.toUpperCase());
    if (!countryKey) push("country", "Country is required");
    else if (!country) push("country", "Unknown country");

    const isActive = parseActive(activeText);
    if (activeText === "") push("is_active", "Active status is required");
    else if (isActive == null) push("is_active", "Active status must be true or false");

    if (employeeNumber) {
      const first = seenNumbers.get(employeeNumber.toLowerCase());
      if (first !== undefined) {
        push("employee_number", `Duplicate employee number (also on row ${first})`);
      } else {
        seenNumbers.set(employeeNumber.toLowerCase(), rowNumber);
      }
    }

    const salaryFields = [effectiveOnText, amountText, currencyText];
    const salaryPresent = salaryFields.some((value) => value !== "");
    const salaryComplete = salaryFields.every((value) => value !== "");
    let salary: ValidatedImportRow["salary"] = null;
    if (salaryPresent && !salaryComplete) {
      push("amount", "effective_on, amount, and currency_code must be provided together");
    } else if (salaryComplete) {
      const date = EffectiveOnSchema.safeParse(effectiveOnText);
      if (!date.success) push("effective_on", "effective_on must be a valid YYYY-MM-DD date");
      let amountMinor: bigint | null = null;
      try {
        amountMinor = parseMajorToMinor(amountText);
      } catch {
        push("amount", "amount must be a non-negative major-unit decimal with at most 2 places");
      }
      const currency = CurrencyCodeSchema.safeParse(currencyText.toUpperCase());
      if (!currency.success) push("currency_code", "Unsupported currency");
      if (date.success && amountMinor != null && currency.success) {
        const key = revisionKey(employeeNumber.toLowerCase(), date.data);
        const firstPair = seenPairs.get(key);
        if (firstPair !== undefined) {
          push("effective_on", `Duplicate employee/effective date (also on row ${firstPair})`);
        } else {
          seenPairs.set(key, rowNumber);
        }
        salary = {
          effectiveOn: parseEffectiveOn(date.data),
          effectiveOnText: date.data,
          amountMinor,
          currencyCode: currency.data,
          reason: reasonText || null,
        };
      }
    }

    if (department && country && employeeNumber && fullName && isActive != null && errors.every((e) => e.rowNumber !== rowNumber)) {
      validated.push({
        rowNumber,
        employeeNumber,
        fullName,
        departmentName: department.name,
        countryKey,
        isActive,
        departmentId: department.id,
        countryId: country.id,
        salary,
      });
    }
  });

  if (errors.length > 0) {
    reject(errors);
  }
  return validated;
}

export async function loadImportLookups() {
  const [departments, countries] = await Promise.all([
    prisma.department.findMany({ select: { id: true, name: true } }),
    prisma.country.findMany({ select: { id: true, code: true, name: true } }),
  ]);
  return {
    departments: new Map(departments.map((row) => [row.name.toLowerCase(), row])),
    countriesByName: new Map(countries.map((row) => [row.name.toLowerCase(), row])),
    countriesByCode: new Map(countries.map((row) => [row.code.trim().toUpperCase(), row])),
  };
}

export async function snapshotImport(rows: ValidatedImportRow[]): Promise<ImportSnapshot> {
  const numbers = rows.map((row) => row.employeeNumber);
  const employees = await prisma.employee.findMany({
    where: { employeeNumber: { in: numbers } },
    select: {
      id: true,
      employeeNumber: true,
      isActive: true,
      fullName: true,
      departmentId: true,
      countryId: true,
    },
  });
  const revisions = await prisma.salaryRevision.findMany({
    where: { employee: { employeeNumber: { in: numbers } } },
    select: {
      id: true,
      version: true,
      amountMinor: true,
      currencyCode: true,
      effectiveOn: true,
      employee: { select: { employeeNumber: true } },
    },
  });
  return {
    employees: new Map(
      employees.map((row) => [
        row.employeeNumber,
        {
          id: row.id,
          isActive: row.isActive,
          fullName: row.fullName,
          departmentId: row.departmentId,
          countryId: row.countryId,
        },
      ]),
    ),
    revisions: new Map(
      revisions.map((row) => [
        revisionKey(row.employee.employeeNumber, formatEffectiveOn(row.effectiveOn)),
        {
          id: row.id,
          version: row.version,
          amountMinor: row.amountMinor,
          currencyCode: row.currencyCode.trim(),
        },
      ]),
    ),
  };
}

export async function commitEmployeeImport(
  rows: ValidatedImportRow[],
  snapshot: ImportSnapshot,
  actorId: string,
): Promise<CsvImportSuccess> {
  const correctionErrors: CsvRowError[] = [];
  for (const row of rows) {
    if (!row.salary) continue;
    const existing = snapshot.revisions.get(revisionKey(row.employeeNumber, row.salary.effectiveOnText));
    if (
      existing &&
      (existing.amountMinor !== row.salary.amountMinor || existing.currencyCode !== row.salary.currencyCode) &&
      !row.salary.reason
    ) {
      correctionErrors.push({
        rowNumber: row.rowNumber,
        field: "reason",
        message: "reason is required when correcting an existing salary date",
      });
    }
  }
  if (correctionErrors.length > 0) {
    reject(correctionErrors);
  }

  try {
  const result = await prisma.$transaction(async (tx) => {
    let employeesTouched = 0;
    let revisionsTouched = 0;
    const employeeIds = new Map<string, string>();

    for (const row of rows) {
      const current = snapshot.employees.get(row.employeeNumber);
      if (!current) {
        const created = await tx.employee.create({
          data: {
            employeeNumber: row.employeeNumber,
            fullName: row.fullName,
            departmentId: row.departmentId,
            countryId: row.countryId,
            isActive: row.isActive,
            deactivatedAt: row.isActive ? null : new Date(),
            updatedAt: new Date(),
          },
        });
        employeeIds.set(row.employeeNumber, created.id);
        employeesTouched += 1;
        continue;
      }

      employeeIds.set(row.employeeNumber, current.id);
      if (!current.isActive && row.isActive) {
        throw new AppError(400, ErrorCode.CSV_INVALID, "CSV file is invalid", {
          rows: [
            {
              rowNumber: row.rowNumber,
              field: "is_active",
              message: "Reactivation is not supported",
            },
          ],
        });
      }

      const nextActive = current.isActive && row.isActive;
      const deactivate = current.isActive && !row.isActive;
      const identityChanged =
        current.fullName !== row.fullName ||
        current.departmentId !== row.departmentId ||
        current.countryId !== row.countryId ||
        deactivate;
      if (identityChanged) {
        await tx.employee.update({
          where: { id: current.id },
          data: {
            fullName: row.fullName,
            departmentId: row.departmentId,
            countryId: row.countryId,
            isActive: nextActive,
            deactivatedAt: deactivate ? new Date() : undefined,
          },
        });
        employeesTouched += 1;
      }
    }

    for (const row of rows) {
      if (!row.salary) continue;
      const employeeId = employeeIds.get(row.employeeNumber);
      if (!employeeId) continue;
      const existing = snapshot.revisions.get(revisionKey(row.employeeNumber, row.salary.effectiveOnText));
      if (!existing) {
        const created = await tx.salaryRevision.create({
          data: {
            employeeId,
            amountMinor: row.salary.amountMinor,
            currencyCode: row.salary.currencyCode,
            effectiveOn: row.salary.effectiveOn,
            reason: row.salary.reason,
            version: 1,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            employeeId,
            salaryRevisionId: created.id,
            action: "SALARY_IMPORT_CREATE",
            newValue: salarySnapshot(created),
          },
        });
        revisionsTouched += 1;
        continue;
      }

      if (
        existing.amountMinor === row.salary.amountMinor &&
        existing.currencyCode === row.salary.currencyCode
      ) {
        continue;
      }

      const updated = await tx.salaryRevision.updateMany({
        where: { id: existing.id, version: existing.version },
        data: {
          amountMinor: row.salary.amountMinor,
          currencyCode: row.salary.currencyCode,
          reason: row.salary.reason,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new AppError(409, ErrorCode.CONFLICT, "CSV import conflicted with a concurrent update", {
          rows: [
            {
              employeeNumber: row.employeeNumber,
              effectiveOn: row.salary.effectiveOnText,
              message: "Salary revision was updated by someone else",
            },
          ],
        });
      }
      const current = await tx.salaryRevision.findUniqueOrThrow({ where: { id: existing.id } });
      await tx.auditLog.create({
        data: {
          actorId,
          employeeId,
          salaryRevisionId: current.id,
          action: "SALARY_IMPORT_CORRECT",
          previousValue: salarySnapshot({
            ...current,
            amountMinor: existing.amountMinor,
            currencyCode: existing.currencyCode,
            version: existing.version,
          }),
          newValue: salarySnapshot(current),
        },
      });
      revisionsTouched += 1;
    }

    return { imported: { employees: employeesTouched, revisions: revisionsTouched } };
  });
  return result;
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, ErrorCode.CONFLICT, "CSV import conflicted with a concurrent update", {
        rows: [{ employeeNumber: "", effectiveOn: "", message: "A salary revision appeared during import" }],
      });
    }
    throw err;
  }
}

export async function importEmployeeCsv(
  text: string,
  actorId: string,
  maxRows: number,
): Promise<CsvImportSuccess> {
  const lookups = await loadImportLookups();
  const rows = validateImportCsv(text, lookups, maxRows);
  const snapshot = await snapshotImport(rows);
  return commitEmployeeImport(rows, snapshot, actorId);
}

function csvBool(value: boolean): string {
  return value ? "true" : "false";
}

export async function writeEmployeeExport(
  query: EmployeeFilterQuery,
  write: (chunk: string) => void,
): Promise<void> {
  write(`${CSV_HEADERS.join(",")}\n`);
  const where = employeeListWhere(query);
  let skip = 0;
  for (;;) {
    const employees = await prisma.employee.findMany({
      where,
      include: { department: true, country: true },
      orderBy: [{ employeeNumber: "asc" }, { id: "asc" }],
      skip,
      take: EXPORT_BATCH,
    });
    if (employees.length === 0) break;
    const salaries = await findCurrentSalaries(employees.map((employee) => employee.id));
    for (const employee of employees) {
      const salary = salaries.get(employee.id);
      write(
        `${serializeCsvRow([
          employee.employeeNumber,
          employee.fullName,
          employee.department.name,
          employee.country.name,
          csvBool(employee.isActive),
          salary?.effectiveOn ?? "",
          salary ? formatMinorAsMajor(BigInt(salary.amountMinor)) : "",
          salary?.currencyCode ?? "",
          salary?.reason ?? "",
        ])}\n`,
      );
    }
    if (employees.length < EXPORT_BATCH) break;
    skip += EXPORT_BATCH;
  }
}
