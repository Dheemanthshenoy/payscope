import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { ErrorCode, formatEffectiveOn, utcToday } from "@payscope/shared";
import { prisma } from "../src/db/prisma.js";
import {
  APP_ORIGIN,
  cookieHeader,
  cookieValue,
  createHrUser,
  createTestCountry,
  deleteHrUserByEmail,
  login,
  testApp,
  testConfig,
} from "./helpers.js";

const password = "correct-horse-battery";
const prefix = `__m6_${randomUUID().slice(0, 8)}`;

function addDays(base: Date, days: number): Date {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + days));
}

function dateOnly(daysFromToday: number): string {
  return formatEffectiveOn(addDays(utcToday(), daysFromToday));
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

afterEach(async () => {
  await cleanup();
});

async function seedDirectory() {
  const departmentA = await prisma.department.create({ data: { name: `${prefix}-Eng` } });
  const departmentB = await prisma.department.create({ data: { name: `${prefix}-Sales` } });
  const countryIn = await createTestCountry(`${prefix}-India`);
  const countryUs = await createTestCountry(`${prefix}-US`);
  return { departmentA, departmentB, countryIn, countryUs };
}

async function createEmployee(input: {
  number: string;
  name: string;
  departmentId: string;
  countryId: string;
  isActive?: boolean;
}) {
  return prisma.employee.create({
    data: {
      employeeNumber: `${prefix}-${input.number}`,
      fullName: input.name,
      departmentId: input.departmentId,
      countryId: input.countryId,
      isActive: input.isActive ?? true,
      deactivatedAt: input.isActive === false ? new Date() : null,
      updatedAt: new Date(),
    },
  });
}

async function session() {
  const email = `${prefix}-${randomUUID()}@example.com`;
  await createHrUser(email, password);
  const config = testConfig();
  const app = testApp(config);
  const loggedIn = await login(app, email, password);
  const token = cookieValue(cookieHeader(loggedIn, config.cookieName), config.cookieName);
  return {
    app,
    config,
    email,
    token,
    cookie: `${config.cookieName}=${token}`,
    actorId: loggedIn.body.data.id as string,
  };
}

describe("employee directory and salaries", () => {
  it("returns 404 for an unknown employee", async () => {
    const { app, cookie } = await session();
    const res = await request(app).get(`/api/employees/${randomUUID()}`).set("Cookie", cookie);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
  });

  it("rejects unauthenticated directory access", async () => {
    const res = await request(testApp()).get("/api/employees");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHENTICATED);
  });

  it("lists active employees by default with pagination and search", async () => {
    const { departmentA, departmentB, countryIn, countryUs } = await seedDirectory();
    const alice = await createEmployee({
      number: "001",
      name: "Alice Smith",
      departmentId: departmentA.id,
      countryId: countryIn.id,
    });
    await createEmployee({
      number: "002",
      name: "Bob Jones",
      departmentId: departmentB.id,
      countryId: countryUs.id,
    });
    await createEmployee({
      number: "003",
      name: "Inactive Ivy",
      departmentId: departmentA.id,
      countryId: countryIn.id,
      isActive: false,
    });
    const { app, cookie } = await session();

    const def = await request(app).get("/api/employees").set("Cookie", cookie);
    expect(def.status).toBe(200);
    const numbers = def.body.data.items.map((row: { employeeNumber: string }) => row.employeeNumber);
    expect(numbers).toContain(`${prefix}-001`);
    expect(numbers).toContain(`${prefix}-002`);
    expect(numbers).not.toContain(`${prefix}-003`);

    const inactive = await request(app)
      .get("/api/employees")
      .query({ status: "inactive" })
      .set("Cookie", cookie);
    expect(inactive.body.data.items.map((row: { employeeNumber: string }) => row.employeeNumber)).toEqual([
      `${prefix}-003`,
    ]);

    const search = await request(app).get("/api/employees").query({ q: "alice" }).set("Cookie", cookie);
    expect(search.body.data.items).toHaveLength(1);
    expect(search.body.data.items[0].id).toBe(alice.id);

    const byNumber = await request(app)
      .get("/api/employees")
      .query({ q: `${prefix}-001` })
      .set("Cookie", cookie);
    expect(byNumber.body.data.items[0].id).toBe(alice.id);

    const page1 = await request(app)
      .get("/api/employees")
      .query({ departmentId: departmentA.id, status: "all", page: 1, pageSize: 1 })
      .set("Cookie", cookie);
    expect(page1.body.data.totalCount).toBe(2);
    expect(page1.body.data.pageSize).toBe(1);
    expect(page1.body.data.items).toHaveLength(1);

    const page2 = await request(app)
      .get("/api/employees")
      .query({ departmentId: departmentA.id, status: "all", page: 2, pageSize: 1 })
      .set("Cookie", cookie);
    expect(page2.body.data.items).toHaveLength(1);
    expect(page2.body.data.items[0].id).not.toBe(page1.body.data.items[0].id);
  });

  it("returns currentSalary null when none is effective", async () => {
    const { departmentA, countryIn } = await seedDirectory();
    const employee = await createEmployee({
      number: "100",
      name: "No Salary Ned",
      departmentId: departmentA.id,
      countryId: countryIn.id,
    });
    const { app, cookie } = await session();
    const res = await request(app).get(`/api/employees/${employee.id}`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.currentSalary).toBeNull();
  });

  it("uses the latest UTC-effective revision and ignores future pay", async () => {
    const { departmentA, countryIn } = await seedDirectory();
    const employee = await createEmployee({
      number: "200",
      name: "Future Fay",
      departmentId: departmentA.id,
      countryId: countryIn.id,
    });
    await prisma.salaryRevision.create({
      data: {
        employeeId: employee.id,
        amountMinor: 100000n,
        currencyCode: "INR",
        effectiveOn: addDays(utcToday(), -10),
        reason: "past",
        version: 1,
        updatedAt: new Date(),
      },
    });
    await prisma.salaryRevision.create({
      data: {
        employeeId: employee.id,
        amountMinor: 999999n,
        currencyCode: "INR",
        effectiveOn: addDays(utcToday(), 10),
        reason: "future",
        version: 1,
        updatedAt: new Date(),
      },
    });
    const { app, cookie } = await session();
    const res = await request(app).get(`/api/employees/${employee.id}`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.currentSalary.amountMinor).toBe("100000");
    expect(res.body.data.currentSalary.effectiveOn).toBe(dateOnly(-10));

    const onlyFuture = await createEmployee({
      number: "201",
      name: "Later Larry",
      departmentId: departmentA.id,
      countryId: countryIn.id,
    });
    await prisma.salaryRevision.create({
      data: {
        employeeId: onlyFuture.id,
        amountMinor: 5000n,
        currencyCode: "USD",
        effectiveOn: addDays(utcToday(), 30),
        version: 1,
        updatedAt: new Date(),
      },
    });
    const futureRes = await request(app).get(`/api/employees/${onlyFuture.id}`).set("Cookie", cookie);
    expect(futureRes.body.data.currentSalary).toBeNull();
  });

  it("creates a salary revision and an atomic audit record", async () => {
    const { departmentA, countryIn } = await seedDirectory();
    const employee = await createEmployee({
      number: "300",
      name: "Create Cara",
      departmentId: departmentA.id,
      countryId: countryIn.id,
    });
    const { app, cookie } = await session();
    const res = await request(app)
      .post(`/api/employees/${employee.id}/salary-revisions`)
      .set("Origin", APP_ORIGIN)
      .set("Cookie", cookie)
      .send({
        amountMinor: "250000",
        currencyCode: "INR",
        effectiveOn: dateOnly(0),
        reason: "offer",
      });
    expect(res.status).toBe(201);
    expect(res.body.data.amountMinor).toBe("250000");
    expect(typeof res.body.data.amountMinor).toBe("string");

    const audits = await request(app)
      .get(`/api/employees/${employee.id}/audit-logs`)
      .set("Cookie", cookie);
    expect(audits.body.data.totalCount).toBe(1);
    expect(audits.body.data.items[0].action).toBe("SALARY_CREATE");
    expect(audits.body.data.items[0].previousValue).toBeNull();
    expect(audits.body.data.items[0].newValue.amountMinor).toBe("250000");
    expect(audits.body.data.items[0].actor).not.toHaveProperty("passwordHash");
  });

  it("rejects a duplicate employee/effective date with 409", async () => {
    const { departmentA, countryIn } = await seedDirectory();
    const employee = await createEmployee({
      number: "310",
      name: "Dup Dana",
      departmentId: departmentA.id,
      countryId: countryIn.id,
    });
    const { app, cookie } = await session();
    const payload = { amountMinor: "1000", currencyCode: "USD", effectiveOn: dateOnly(0) };
    const first = await request(app)
      .post(`/api/employees/${employee.id}/salary-revisions`)
      .set("Origin", APP_ORIGIN)
      .set("Cookie", cookie)
      .send(payload);
    const second = await request(app)
      .post(`/api/employees/${employee.id}/salary-revisions`)
      .set("Origin", APP_ORIGIN)
      .set("Cookie", cookie)
      .send(payload);
    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe(ErrorCode.CONFLICT);
    expect(await prisma.salaryRevision.count({ where: { employeeId: employee.id } })).toBe(1);
  });

  it("updates the same revision on correction and writes previous/new audit values", async () => {
    const { departmentA, countryIn } = await seedDirectory();
    const employee = await createEmployee({
      number: "320",
      name: "Correct Cora",
      departmentId: departmentA.id,
      countryId: countryIn.id,
    });
    const { app, cookie } = await session();
    const created = await request(app)
      .post(`/api/employees/${employee.id}/salary-revisions`)
      .set("Origin", APP_ORIGIN)
      .set("Cookie", cookie)
      .send({ amountMinor: "1000", currencyCode: "USD", effectiveOn: dateOnly(-1) });
    const revisionId = created.body.data.id as string;

    const corrected = await request(app)
      .patch(`/api/employees/${employee.id}/salary-revisions/${revisionId}`)
      .set("Origin", APP_ORIGIN)
      .set("Cookie", cookie)
      .send({
        amountMinor: "1500",
        currencyCode: "USD",
        reason: "typo",
        expectedVersion: 1,
      });
    expect(corrected.status).toBe(200);
    expect(corrected.body.data.id).toBe(revisionId);
    expect(corrected.body.data.amountMinor).toBe("1500");
    expect(corrected.body.data.version).toBe(2);
    expect(await prisma.salaryRevision.count({ where: { employeeId: employee.id } })).toBe(1);

    const audits = await request(app)
      .get(`/api/employees/${employee.id}/audit-logs`)
      .set("Cookie", cookie);
    const correct = audits.body.data.items.find((row: { action: string }) => row.action === "SALARY_CORRECT");
    expect(correct.previousValue.amountMinor).toBe("1000");
    expect(correct.newValue.amountMinor).toBe("1500");
  });

  it("returns 409 when expectedVersion is stale", async () => {
    const { departmentA, countryIn } = await seedDirectory();
    const employee = await createEmployee({
      number: "330",
      name: "Stale Sam",
      departmentId: departmentA.id,
      countryId: countryIn.id,
    });
    const { app, cookie } = await session();
    const created = await request(app)
      .post(`/api/employees/${employee.id}/salary-revisions`)
      .set("Origin", APP_ORIGIN)
      .set("Cookie", cookie)
      .send({ amountMinor: "1000", currencyCode: "EUR", effectiveOn: dateOnly(0) });

    await request(app)
      .patch(`/api/employees/${employee.id}/salary-revisions/${created.body.data.id}`)
      .set("Origin", APP_ORIGIN)
      .set("Cookie", cookie)
      .send({ amountMinor: "1100", currencyCode: "EUR", reason: "first", expectedVersion: 1 });

    const stale = await request(app)
      .patch(`/api/employees/${employee.id}/salary-revisions/${created.body.data.id}`)
      .set("Origin", APP_ORIGIN)
      .set("Cookie", cookie)
      .send({ amountMinor: "1200", currencyCode: "EUR", reason: "stale", expectedVersion: 1 });
    expect(stale.status).toBe(409);
    const stored = await prisma.salaryRevision.findUniqueOrThrow({
      where: { id: created.body.data.id },
    });
    expect(stored.version).toBe(2);
    expect(stored.amountMinor).toBe(1100n);
  });

  it("rejects negative amounts, unsupported currencies, and invalid dates", async () => {
    const { departmentA, countryIn } = await seedDirectory();
    const employee = await createEmployee({
      number: "340",
      name: "Invalid Ida",
      departmentId: departmentA.id,
      countryId: countryIn.id,
    });
    const { app, cookie } = await session();
    const url = `/api/employees/${employee.id}/salary-revisions`;

    const negative = await request(app)
      .post(url)
      .set("Origin", APP_ORIGIN)
      .set("Cookie", cookie)
      .send({ amountMinor: "-1", currencyCode: "USD", effectiveOn: dateOnly(0) });
    const currency = await request(app)
      .post(url)
      .set("Origin", APP_ORIGIN)
      .set("Cookie", cookie)
      .send({ amountMinor: "1", currencyCode: "JPY", effectiveOn: dateOnly(0) });
    const date = await request(app)
      .post(url)
      .set("Origin", APP_ORIGIN)
      .set("Cookie", cookie)
      .send({ amountMinor: "1", currencyCode: "USD", effectiveOn: "2026-02-31" });

    expect(negative.status).toBe(400);
    expect(currency.status).toBe(400);
    expect(date.status).toBe(400);
  });

  it("rejects correcting another employee's revision", async () => {
    const { departmentA, countryIn } = await seedDirectory();
    const owner = await createEmployee({
      number: "350",
      name: "Owner",
      departmentId: departmentA.id,
      countryId: countryIn.id,
    });
    const other = await createEmployee({
      number: "351",
      name: "Other",
      departmentId: departmentA.id,
      countryId: countryIn.id,
    });
    const { app, cookie } = await session();
    const created = await request(app)
      .post(`/api/employees/${owner.id}/salary-revisions`)
      .set("Origin", APP_ORIGIN)
      .set("Cookie", cookie)
      .send({ amountMinor: "1000", currencyCode: "GBP", effectiveOn: dateOnly(0) });

    const res = await request(app)
      .patch(`/api/employees/${other.id}/salary-revisions/${created.body.data.id}`)
      .set("Origin", APP_ORIGIN)
      .set("Cookie", cookie)
      .send({ amountMinor: "2000", currencyCode: "GBP", reason: "steal", expectedVersion: 1 });
    expect(res.status).toBe(404);
    const stored = await prisma.salaryRevision.findUniqueOrThrow({
      where: { id: created.body.data.id },
    });
    expect(stored.amountMinor).toBe(1000n);
  });

  it("keeps salary and audit history after deactivation", async () => {
    const { departmentA, countryIn } = await seedDirectory();
    const employee = await createEmployee({
      number: "360",
      name: "Departing Dee",
      departmentId: departmentA.id,
      countryId: countryIn.id,
    });
    const { app, cookie } = await session();
    await request(app)
      .post(`/api/employees/${employee.id}/salary-revisions`)
      .set("Origin", APP_ORIGIN)
      .set("Cookie", cookie)
      .send({ amountMinor: "8000", currencyCode: "AED", effectiveOn: dateOnly(-2) });

    const deactivated = await request(app)
      .patch(`/api/employees/${employee.id}/deactivate`)
      .set("Origin", APP_ORIGIN)
      .set("Cookie", cookie);
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.data.isActive).toBe(false);
    expect(deactivated.body.data.deactivatedAt).toBeTruthy();

    const again = await request(app)
      .patch(`/api/employees/${employee.id}/deactivate`)
      .set("Origin", APP_ORIGIN)
      .set("Cookie", cookie);
    expect(again.status).toBe(200);
    expect(again.body.data.deactivatedAt).toBe(deactivated.body.data.deactivatedAt);

    const history = await request(app)
      .get(`/api/employees/${employee.id}/salary-revisions`)
      .set("Cookie", cookie);
    expect(history.body.data).toHaveLength(1);
    const audits = await request(app)
      .get(`/api/employees/${employee.id}/audit-logs`)
      .set("Cookie", cookie);
    expect(audits.body.data.totalCount).toBe(1);

    const listed = await request(app)
      .get("/api/employees")
      .query({ status: "inactive", q: "Departing" })
      .set("Cookie", cookie);
    expect(listed.body.data.items[0].id).toBe(employee.id);
  });

  it("requires Origin on salary and deactivation mutations", async () => {
    const { departmentA, countryIn } = await seedDirectory();
    const employee = await createEmployee({
      number: "370",
      name: "Origin Ollie",
      departmentId: departmentA.id,
      countryId: countryIn.id,
    });
    const { app, cookie } = await session();
    const create = await request(app)
      .post(`/api/employees/${employee.id}/salary-revisions`)
      .set("Cookie", cookie)
      .send({ amountMinor: "1", currencyCode: "USD", effectiveOn: dateOnly(0) });
    const deactivate = await request(app)
      .patch(`/api/employees/${employee.id}/deactivate`)
      .set("Cookie", cookie);
    expect(create.status).toBe(403);
    expect(deactivate.status).toBe(403);
    expect(create.body.error.code).toBe(ErrorCode.CSRF);
  });
});
