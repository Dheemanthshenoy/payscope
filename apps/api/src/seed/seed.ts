import type { CurrencyCode } from "@payscope/shared";
import { prisma } from "../db/prisma.js";
import { hashPassword } from "../auth/password.js";
import {
  SEED_COUNTRIES,
  SEED_DEPARTMENTS,
  SEED_EMPLOYEE_COUNT,
  SEED_NUMBER_PREFIX,
  seedAmountMinor,
  seedEmployeeNumber,
  seedFullName,
} from "./catalog.js";

export type SeedOptions = {
  employeeCount?: number;
  numberPrefix?: string;
  hrEmail?: string;
  hrPassword?: string;
};

export type SeedResult = {
  departments: number;
  countries: number;
  employeesCreated: number;
  employeesSkipped: number;
  revisionsCreated: number;
  hrCreated: boolean;
};

function addUtcDays(base: Date, days: number): Date {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + days));
}

export async function seedPayscope(options: SeedOptions = {}): Promise<SeedResult> {
  const employeeCount = options.employeeCount ?? SEED_EMPLOYEE_COUNT;
  const prefix = options.numberPrefix ?? SEED_NUMBER_PREFIX;
  let hrCreated = false;

  for (const name of SEED_DEPARTMENTS) {
    await prisma.department.upsert({
      where: { name },
      create: { name },
      update: {},
    });
  }
  for (const country of SEED_COUNTRIES) {
    await prisma.country.upsert({
      where: { code: country.code },
      create: { code: country.code, name: country.name },
      update: { name: country.name },
    });
  }

  if (options.hrEmail && options.hrPassword) {
    const existing = await prisma.hRUser.findUnique({ where: { email: options.hrEmail } });
    if (!existing) {
      await prisma.hRUser.create({
        data: {
          email: options.hrEmail,
          passwordHash: await hashPassword(options.hrPassword),
          role: "HR",
        },
      });
      hrCreated = true;
    }
  }

  const departments = await prisma.department.findMany();
  const countries = await prisma.country.findMany();
  const departmentByName = new Map(departments.map((row) => [row.name, row]));
  const countryByCode = new Map(countries.map((row) => [row.code.trim(), row]));

  const existing = await prisma.employee.findMany({
    where: { employeeNumber: { startsWith: prefix } },
    select: {
      id: true,
      employeeNumber: true,
      fullName: true,
      salaryRevisions: { select: { effectiveOn: true } },
    },
  });
  const existingByNumber = new Map(existing.map((row) => [row.employeeNumber, row]));

  let employeesCreated = 0;
  let employeesSkipped = 0;
  let revisionsCreated = 0;
  const today = new Date();
  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  const pendingEmployees: {
    employeeNumber: string;
    fullName: string;
    departmentId: string;
    countryId: string;
    isActive: boolean;
    deactivatedAt: Date | null;
    updatedAt: Date;
  }[] = [];
  const pendingRevisions: {
    employeeNumber: string;
    amountMinor: bigint;
    currencyCode: CurrencyCode;
    effectiveOn: Date;
    reason: string;
  }[] = [];

  for (let index = 1; index <= employeeCount; index += 1) {
    const employeeNumber = seedEmployeeNumber(prefix, index);
    const fullName = seedFullName(index);
    const departmentName = SEED_DEPARTMENTS[(index - 1) % SEED_DEPARTMENTS.length] ?? "Engineering";
    const country = SEED_COUNTRIES[(index - 1) % SEED_COUNTRIES.length] ?? SEED_COUNTRIES[0];
    const department = departmentByName.get(departmentName);
    const countryRow = countryByCode.get(country.code);
    if (!department || !countryRow) {
      throw new Error("Seed lookups are missing");
    }

    const found = existingByNumber.get(employeeNumber);
    if (found && found.fullName !== fullName) {
      employeesSkipped += 1;
      continue;
    }

    const isActive = index % 13 !== 0;
    if (!found) {
      pendingEmployees.push({
        employeeNumber,
        fullName,
        departmentId: department.id,
        countryId: countryRow.id,
        isActive,
        deactivatedAt: isActive ? null : utcToday,
        updatedAt: utcToday,
      });
    }

    const currency = country.currency;
    const amountMinor = seedAmountMinor(index);
    const unpaid = index % 19 === 0;
    const historic = index % 5 === 0;
    const future = index % 11 === 0;
    const existingDates = new Set(
      (found?.salaryRevisions ?? []).map((row) => row.effectiveOn.toISOString().slice(0, 10)),
    );

    const addRevision = (effectiveOn: Date, reason: string, amount = amountMinor) => {
      const key = effectiveOn.toISOString().slice(0, 10);
      if (existingDates.has(key)) return;
      existingDates.add(key);
      pendingRevisions.push({
        employeeNumber,
        amountMinor: amount,
        currencyCode: currency,
        effectiveOn,
        reason,
      });
    };

    if (!unpaid) {
      addRevision(addUtcDays(utcToday, -120), "seed-current");
      if (historic) {
        addRevision(
          addUtcDays(utcToday, -400),
          "seed-history",
          amountMinor - 5_000_00n > 0n ? amountMinor - 5_000_00n : amountMinor,
        );
      }
    }
    if (future || unpaid) {
      addRevision(addUtcDays(utcToday, 180), "seed-future", amountMinor + 8_000_00n);
    }
  }

  const batchSize = 250;
  for (let i = 0; i < pendingEmployees.length; i += batchSize) {
    const batch = pendingEmployees.slice(i, i + batchSize);
    await prisma.employee.createMany({ data: batch });
    employeesCreated += batch.length;
  }

  const numbers = [...new Set(pendingRevisions.map((row) => row.employeeNumber))];
  const createdEmployees = await prisma.employee.findMany({
    where: { employeeNumber: { in: numbers } },
    select: { id: true, employeeNumber: true },
  });
  const idByNumber = new Map(createdEmployees.map((row) => [row.employeeNumber, row.id]));

  const revisionData = pendingRevisions.flatMap((row) => {
    const employeeId = idByNumber.get(row.employeeNumber);
    if (!employeeId) return [];
    return [
      {
        employeeId,
        amountMinor: row.amountMinor,
        currencyCode: row.currencyCode,
        effectiveOn: row.effectiveOn,
        reason: row.reason,
        version: 1,
      },
    ];
  });

  for (let i = 0; i < revisionData.length; i += batchSize) {
    const batch = revisionData.slice(i, i + batchSize);
    const written = await prisma.salaryRevision.createMany({ data: batch, skipDuplicates: true });
    revisionsCreated += written.count;
  }

  return {
    departments: SEED_DEPARTMENTS.length,
    countries: SEED_COUNTRIES.length,
    employeesCreated,
    employeesSkipped,
    revisionsCreated,
    hrCreated,
  };
}
