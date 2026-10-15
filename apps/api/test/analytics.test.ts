import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { ErrorCode, formatEffectiveOn, utcToday } from "@payscope/shared";
import { prisma } from "../src/db/prisma.js";
import {
  cookieHeader,
  cookieValue,
  createHrUser,
  createTestCountry,
  login,
  testApp,
  testConfig,
} from "./helpers.js";

const password = "correct-horse-battery";
const prefix = `__m7a_${randomUUID().slice(0, 8)}`;

function addDays(base: Date, days: number): Date {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + days));
}

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
    await prisma.department.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.country.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.hRUser.deleteMany({ where: { email: { startsWith: prefix } } });
  });
}

afterEach(cleanup);

async function session() {
  const email = `${prefix}-${randomUUID()}@example.com`;
  await createHrUser(email, password);
  const config = testConfig();
  const app = testApp(config);
  const loggedIn = await login(app, email, password);
  const token = cookieValue(cookieHeader(loggedIn, config.cookieName), config.cookieName);
  return { app, cookie: `${config.cookieName}=${token}` };
}

async function fixtures() {
  const eng = await prisma.department.create({ data: { name: `${prefix}-Eng` } });
  const sales = await prisma.department.create({ data: { name: `${prefix}-Sales` } });
  const unpaidDept = await prisma.department.create({ data: { name: `${prefix}-Unpaid` } });
  const india = await createTestCountry(`${prefix}-India`);
  const usa = await createTestCountry(`${prefix}-US`);

  async function employee(
    number: string,
    name: string,
    departmentId: string,
    countryId: string,
    isActive = true,
  ) {
    return prisma.employee.create({
      data: {
        employeeNumber: `${prefix}-${number}`,
        fullName: name,
        departmentId,
        countryId,
        isActive,
        deactivatedAt: isActive ? null : new Date(),
        updatedAt: new Date(),
      },
    });
  }

  async function pay(employeeId: string, amountMinor: bigint, currencyCode: string, days: number) {
    await prisma.salaryRevision.create({
      data: {
        employeeId,
        amountMinor,
        currencyCode,
        effectiveOn: addDays(utcToday(), days),
        reason: "fixture",
        version: 1,
      },
    });
  }

  const even = [
    await employee("001", "Even One", eng.id, india.id),
    await employee("002", "Even Two", eng.id, india.id),
    await employee("003", "Even Three", eng.id, india.id),
    await employee("004", "Even Four", eng.id, india.id),
  ];
  await pay(even[0]!.id, 100n, "INR", -10);
  await pay(even[1]!.id, 200n, "INR", -10);
  await pay(even[2]!.id, 300n, "INR", -10);
  await pay(even[3]!.id, 400n, "INR", -10);

  const odd = [
    await employee("011", "Odd One", sales.id, usa.id),
    await employee("012", "Odd Two", sales.id, usa.id),
    await employee("013", "Odd Three", sales.id, usa.id),
  ];
  await pay(odd[0]!.id, 100n, "USD", -10);
  await pay(odd[1]!.id, 200n, "USD", -10);
  await pay(odd[2]!.id, 300n, "USD", -10);

  const usdInEng = await employee("021", "Usd In Eng", eng.id, india.id);
  await pay(usdInEng.id, 9999n, "USD", -10);

  const unpaid = await employee("031", "Unpaid", unpaidDept.id, india.id);
  const future = await employee("032", "Future Only", unpaidDept.id, india.id);
  await pay(future.id, 8888n, "INR", 10);
  const inactive = await employee("033", "Inactive", eng.id, india.id, false);
  await pay(inactive.id, 1_000_000n, "INR", -10);
  const half = [
    await employee("041", "Half A", sales.id, india.id),
    await employee("042", "Half B", sales.id, india.id),
  ];
  await pay(half[0]!.id, 101n, "INR", -10);
  await pay(half[1]!.id, 200n, "INR", -10);

  return { eng, sales, unpaidDept, india, usa, unpaid };
}

describe("compensation analytics", () => {
  it("rejects unauthenticated access", async () => {
    const res = await request(testApp()).get("/api/analytics/compensation");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHENTICATED);
  });

  it("computes exact even/odd median, average, and currency isolation", async () => {
    const { eng, sales } = await fixtures();
    const { app, cookie } = await session();
    const res = await request(app).get("/api/analytics/compensation").set("Cookie", cookie);
    expect(res.status).toBe(200);

    const departments = res.body.data.byDepartment as Array<{
      department: { id: string };
      activeEmployeeCount: number;
      compensatedEmployeeCount: number;
      byCurrency: Array<{
        currencyCode: string;
        compensatedEmployeeCount: number;
        minimum: string | null;
        maximum: string | null;
        average: string | null;
        median: string | null;
        total: string;
      }>;
    }>;

    const engRow = departments.find((row) => row.department.id === eng.id);
    const inr = engRow?.byCurrency.find((row) => row.currencyCode === "INR");
    const usd = engRow?.byCurrency.find((row) => row.currencyCode === "USD");
    expect(engRow?.activeEmployeeCount).toBe(5);
    expect(engRow?.compensatedEmployeeCount).toBe(5);
    expect(inr).toMatchObject({
      compensatedEmployeeCount: 4,
      minimum: "100",
      maximum: "400",
      average: "250",
      median: "250",
      total: "1000",
    });
    expect(usd).toMatchObject({
      compensatedEmployeeCount: 1,
      minimum: "9999",
      maximum: "9999",
      total: "9999",
    });
    expect(inr?.total).not.toBe("10999");

    const salesRow = departments.find((row) => row.department.id === sales.id);
    const salesUsd = salesRow?.byCurrency.find((row) => row.currencyCode === "USD");
    const salesInr = salesRow?.byCurrency.find((row) => row.currencyCode === "INR");
    expect(salesUsd).toMatchObject({ median: "200", average: "200", total: "600" });
    expect(salesInr).toMatchObject({ median: "151", average: "151", minimum: "101", maximum: "200" });
  });

  it("excludes inactive and future pay and keeps unpaid in headcount only", async () => {
    const { unpaidDept } = await fixtures();
    const { app, cookie } = await session();
    const res = await request(app).get("/api/analytics/compensation").set("Cookie", cookie);
    const unpaidRow = res.body.data.byDepartment.find(
      (row: { department: { id: string } }) => row.department.id === unpaidDept.id,
    );
    expect(unpaidRow.activeEmployeeCount).toBe(2);
    expect(unpaidRow.compensatedEmployeeCount).toBe(0);
    expect(unpaidRow.byCurrency).toEqual([]);
  });

  it("filters by department and currency and returns empty salary groups", async () => {
    const { unpaidDept, india } = await fixtures();
    const { app, cookie } = await session();
    const res = await request(app)
      .get("/api/analytics/compensation")
      .query({ departmentId: unpaidDept.id, countryId: india.id, currencyCode: "INR" })
      .set("Cookie", cookie);
    expect(res.body.data.byDepartment).toHaveLength(1);
    expect(res.body.data.byDepartment[0].compensatedEmployeeCount).toBe(0);
    expect(res.body.data.byDepartment[0].byCurrency[0]).toMatchObject({
      currencyCode: "INR",
      compensatedEmployeeCount: 0,
      minimum: null,
      maximum: null,
      average: null,
      median: null,
      total: "0",
    });
  });
});
