import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma.js";
import { assertSeedAllowed } from "../src/seed/guard.js";
import { seedPayscope } from "../src/seed/seed.js";
import { seedFullName } from "../src/seed/catalog.js";

const prefix = "__m7s_";

async function withAuditDeletes<T>(fn: () => Promise<T>): Promise<T> {
  await prisma.$executeRaw`ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_append_only`;
  try {
    return await fn();
  } finally {
    await prisma.$executeRaw`ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_append_only`;
  }
}

async function cleanup(): Promise<void> {
  const employees = await prisma.employee.findMany({
    where: { employeeNumber: { startsWith: prefix } },
    select: { id: true },
  });
  const ids = employees.map((employee) => employee.id);
  await withAuditDeletes(async () => {
    if (ids.length > 0) {
      await prisma.auditLog.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.salaryRevision.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.employee.deleteMany({ where: { id: { in: ids } } });
    }
  });
}

afterEach(cleanup);

describe("seed guards", () => {
  it("refuses test, production-like, and unconfirmed databases", () => {
    expect(() =>
      assertSeedAllowed({
        databaseUrl: "postgresql://localhost:5432/payscope_test",
        nodeEnv: "test",
        argv: [],
      }),
    ).toThrow(/test database/);
    expect(() =>
      assertSeedAllowed({
        databaseUrl: "postgresql://localhost:5432/payscope_prod",
        nodeEnv: "development",
        argv: [],
      }),
    ).toThrow(/non-development/);
    expect(() =>
      assertSeedAllowed({
        databaseUrl: "postgresql://localhost:5432/payscope",
        nodeEnv: "development",
        argv: [],
      }),
    ).toThrow(/--confirm/);
  });

  it("allows an explicit test seed", () => {
    expect(() =>
      assertSeedAllowed({
        databaseUrl: "postgresql://localhost:5432/payscope_test",
        nodeEnv: "test",
        argv: ["--allow-test"],
      }),
    ).not.toThrow();
  });
});

describe("seedPayscope", () => {
  it("is repeatable and does not overwrite renamed employees", async () => {
    const first = await seedPayscope({ employeeCount: 12, numberPrefix: prefix });
    expect(first.employeesCreated).toBe(12);
    expect(first.revisionsCreated).toBeGreaterThan(0);

    const renamed = await prisma.employee.findUniqueOrThrow({
      where: { employeeNumber: `${prefix}00001` },
    });
    await prisma.employee.update({
      where: { id: renamed.id },
      data: { fullName: "Manually Edited" },
    });

    const second = await seedPayscope({ employeeCount: 12, numberPrefix: prefix });
    expect(second.employeesCreated).toBe(0);
    expect(second.employeesSkipped).toBe(1);
    expect(second.revisionsCreated).toBe(0);

    const stillEdited = await prisma.employee.findUniqueOrThrow({
      where: { employeeNumber: `${prefix}00001` },
    });
    expect(stillEdited.fullName).toBe("Manually Edited");
    expect(stillEdited.fullName).not.toBe(seedFullName(1));
  });
});
