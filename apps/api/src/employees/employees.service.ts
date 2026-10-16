import { Prisma } from "@prisma/client";
import {
  ErrorCode,
  type CreateEmployee,
  type EmployeeFilterQuery,
  type EmployeeListQuery,
  type UpdateEmployee,
} from "@payscope/shared";
import { prisma } from "../db/prisma.js";
import { AppError } from "../errors/app-error.js";
import { findCurrentSalaries } from "../salaries/current-salary.js";
import { employeeProfileSnapshot, serializeEmployee } from "./employees.serialize.js";

export function employeeListWhere(query: EmployeeFilterQuery): Prisma.EmployeeWhereInput {
  const where: Prisma.EmployeeWhereInput = {};
  if (query.status === "active") where.isActive = true;
  if (query.status === "inactive") where.isActive = false;
  if (query.departmentId) where.departmentId = query.departmentId;
  if (query.countryId) where.countryId = query.countryId;
  if (query.q) {
    where.OR = [
      { employeeNumber: { contains: query.q, mode: "insensitive" } },
      { fullName: { contains: query.q, mode: "insensitive" } },
    ];
  }
  return where;
}

export async function listEmployees(query: EmployeeListQuery) {
  const where = employeeListWhere(query);
  const skip = (query.page - 1) * query.pageSize;
  const [totalCount, employees] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({
      where,
      include: { department: true, country: true },
      orderBy: [{ employeeNumber: "asc" }, { id: "asc" }],
      skip,
      take: query.pageSize,
    }),
  ]);
  const salaries = await findCurrentSalaries(employees.map((employee) => employee.id));
  return {
    items: employees.map((employee) =>
      serializeEmployee(employee, salaries.get(employee.id)),
    ),
    page: query.page,
    pageSize: query.pageSize,
    totalCount,
  };
}

export async function getEmployee(id: string) {
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: { department: true, country: true },
  });
  if (!employee) {
    throw new AppError(404, ErrorCode.NOT_FOUND, "Employee not found");
  }
  const salaries = await findCurrentSalaries([employee.id]);
  return serializeEmployee(employee, salaries.get(employee.id));
}

async function requireDepartment(id: string) {
  const department = await prisma.department.findUnique({ where: { id }, select: { id: true } });
  if (!department) {
    throw new AppError(400, ErrorCode.VALIDATION, "Department not found");
  }
}

async function requireCountry(id: string) {
  const country = await prisma.country.findUnique({ where: { id }, select: { id: true } });
  if (!country) {
    throw new AppError(400, ErrorCode.VALIDATION, "Country not found");
  }
}

export async function createEmployeeRecord(actorId: string, input: CreateEmployee) {
  await Promise.all([requireDepartment(input.departmentId), requireCountry(input.countryId)]);
  const isActive = input.isActive ?? true;
  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: {
          employeeNumber: input.employeeNumber,
          fullName: input.fullName,
          departmentId: input.departmentId,
          countryId: input.countryId,
          isActive,
          deactivatedAt: isActive ? null : new Date(),
        },
        include: { department: true, country: true },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          employeeId: created.id,
          action: "EMPLOYEE_CREATE",
          newValue: employeeProfileSnapshot(created),
        },
      });
      return serializeEmployee(created, undefined);
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, ErrorCode.CONFLICT, "An employee with this employee number already exists");
    }
    throw err;
  }
}

export async function updateEmployeeRecord(id: string, actorId: string, input: UpdateEmployee) {
  await Promise.all([requireDepartment(input.departmentId), requireCountry(input.countryId)]);
  const existing = await prisma.employee.findUnique({
    where: { id },
    include: { department: true, country: true },
  });
  if (!existing) {
    throw new AppError(404, ErrorCode.NOT_FOUND, "Employee not found");
  }
  const changed =
    existing.fullName !== input.fullName ||
    existing.departmentId !== input.departmentId ||
    existing.countryId !== input.countryId;
  if (!changed) {
    const salaries = await findCurrentSalaries([existing.id]);
    return serializeEmployee(existing, salaries.get(existing.id));
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.employee.update({
      where: { id },
      data: {
        fullName: input.fullName,
        departmentId: input.departmentId,
        countryId: input.countryId,
      },
      include: { department: true, country: true },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        employeeId: updated.id,
        action: "EMPLOYEE_UPDATE",
        previousValue: employeeProfileSnapshot(existing),
        newValue: employeeProfileSnapshot(updated),
      },
    });
    const salaries = await findCurrentSalaries([updated.id]);
    return serializeEmployee(updated, salaries.get(updated.id));
  });
}

export async function deactivateEmployee(id: string) {
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: { department: true, country: true },
  });
  if (!employee) {
    throw new AppError(404, ErrorCode.NOT_FOUND, "Employee not found");
  }
  const updated = employee.isActive
    ? await prisma.employee.update({
        where: { id },
        data: { isActive: false, deactivatedAt: new Date() },
        include: { department: true, country: true },
      })
    : employee;
  const salaries = await findCurrentSalaries([updated.id]);
  return serializeEmployee(updated, salaries.get(updated.id));
}

export async function listDepartments() {
  return prisma.department.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function listCountries() {
  const countries = await prisma.country.findMany({
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true },
  });
  return countries.map((country) => ({
    ...country,
    code: country.code.trim(),
  }));
}
