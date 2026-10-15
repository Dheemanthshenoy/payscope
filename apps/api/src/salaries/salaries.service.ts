import { Prisma } from "@prisma/client";
import {
  ErrorCode,
  formatEffectiveOn,
  parseAmountMinor,
  parseEffectiveOn,
  type CorrectSalaryRevision,
  type CreateSalaryRevision,
} from "@payscope/shared";
import { prisma } from "../db/prisma.js";
import { AppError } from "../errors/app-error.js";
import { salarySnapshot, serializeRevision } from "../employees/employees.serialize.js";

async function requireEmployee(id: string) {
  const employee = await prisma.employee.findUnique({ where: { id }, select: { id: true } });
  if (!employee) {
    throw new AppError(404, ErrorCode.NOT_FOUND, "Employee not found");
  }
  return employee;
}

export async function listSalaryRevisions(employeeId: string) {
  await requireEmployee(employeeId);
  const revisions = await prisma.salaryRevision.findMany({
    where: { employeeId },
    orderBy: [{ effectiveOn: "desc" }, { createdAt: "desc" }],
  });
  return revisions.map(serializeRevision);
}

export async function createSalaryRevision(
  employeeId: string,
  actorId: string,
  input: CreateSalaryRevision,
) {
  await requireEmployee(employeeId);
  const effectiveOn = parseEffectiveOn(input.effectiveOn);
  const amountMinor = parseAmountMinor(input.amountMinor);
  const reason = input.reason?.trim() || null;

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.salaryRevision.create({
        data: {
          employeeId,
          amountMinor,
          currencyCode: input.currencyCode,
          effectiveOn,
          reason,
          version: 1,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          employeeId,
          salaryRevisionId: created.id,
          action: "SALARY_CREATE",
          newValue: salarySnapshot(created),
        },
      });
      return serializeRevision(created);
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(
        409,
        ErrorCode.CONFLICT,
        "A salary revision already exists for this effective date",
      );
    }
    throw err;
  }
}

export async function correctSalaryRevision(
  employeeId: string,
  revisionId: string,
  actorId: string,
  input: CorrectSalaryRevision,
) {
  await requireEmployee(employeeId);
  const amountMinor = parseAmountMinor(input.amountMinor);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.salaryRevision.findUnique({ where: { id: revisionId } });
    if (!existing || existing.employeeId !== employeeId) {
      throw new AppError(404, ErrorCode.NOT_FOUND, "Salary revision not found");
    }
    if (existing.version !== input.expectedVersion) {
      throw new AppError(409, ErrorCode.CONFLICT, "Salary revision was updated by someone else");
    }

    const updated = await tx.salaryRevision.updateMany({
      where: { id: revisionId, employeeId, version: input.expectedVersion },
      data: {
        amountMinor,
        currencyCode: input.currencyCode,
        reason: input.reason.trim(),
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new AppError(409, ErrorCode.CONFLICT, "Salary revision was updated by someone else");
    }

    const current = await tx.salaryRevision.findUniqueOrThrow({ where: { id: revisionId } });
    await tx.auditLog.create({
      data: {
        actorId,
        employeeId,
        salaryRevisionId: current.id,
        action: "SALARY_CORRECT",
        previousValue: salarySnapshot(existing),
        newValue: salarySnapshot(current),
      },
    });
    return serializeRevision(current);
  });
}

export async function listEmployeeAuditLogs(
  employeeId: string,
  page: number,
  pageSize: number,
) {
  await requireEmployee(employeeId);
  const where = { employeeId };
  const [totalCount, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return {
    items: logs.map((log) => ({
      id: log.id,
      action: log.action,
      employeeId: log.employeeId,
      salaryRevisionId: log.salaryRevisionId,
      previousValue: log.previousValue,
      newValue: log.newValue,
      createdAt: log.createdAt.toISOString(),
      actor: { id: log.actor.id, email: log.actor.email },
    })),
    page,
    pageSize,
    totalCount,
  };
}

export { formatEffectiveOn };
