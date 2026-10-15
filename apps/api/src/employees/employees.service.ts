import type { Prisma } from "@prisma/client";
import { ErrorCode, type EmployeeFilterQuery, type EmployeeListQuery } from "@payscope/shared";
import { prisma } from "../db/prisma.js";
import { AppError } from "../errors/app-error.js";
import { findCurrentSalaries } from "../salaries/current-salary.js";
import { serializeEmployee } from "./employees.serialize.js";

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
