import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { CSV_HEADERS, ErrorCode, formatEffectiveOn, utcToday } from "@payscope/shared";
import { prisma } from "../src/db/prisma.js";
import {
  commitEmployeeImport,
  loadImportLookups,
  snapshotImport,
  validateImportCsv,
} from "../src/csv/csv.service.js";
import {
  APP_ORIGIN,
  cookieHeader,
  cookieValue,
  createHrUser,
  createTestCountry,
  login,
  testApp,
  testConfig,
} from "./helpers.js";

const password = "correct-horse-battery";
const prefix = `__m7c_${randomUUID().slice(0, 8)}`;

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

async function lookups() {
  const department = await prisma.department.create({ data: { name: `${prefix}-Eng` } });
  const country = await createTestCountry(`${prefix}-India`);
  return { department, country };
}

function csv(rows: string[][]): string {
  return [CSV_HEADERS.join(","), ...rows.map((row) => row.join(","))].join("\n");
}

function validRow(number: string, extras: Partial<Record<string, string>> = {}): string[] {
  return [
    extras.employee_number ?? `${prefix}-${number}`,
    extras.full_name ?? "Ada Lovelace",
    extras.department ?? `${prefix}-Eng`,
    extras.country ?? `${prefix}-India`,
    extras.is_active ?? "true",
    extras.effective_on ?? formatEffectiveOn(utcToday()),
    extras.amount ?? "1000.50",
    extras.currency_code ?? "INR",
    extras.reason ?? "offer",
  ];
}

describe("CSV import and export", () => {
  it("rejects unauthenticated import and export", async () => {
    const app = testApp();
    const exported = await request(app).get("/api/employees/export");
    const imported = await request(app)
      .post("/api/employees/import")
      .set("Origin", APP_ORIGIN)
      .attach("file", Buffer.from("x"), "x.csv");
    expect(exported.status).toBe(401);
    expect(imported.status).toBe(401);
  });

  it("requires Origin on import", async () => {
    await lookups();
    const { app, cookie } = await session();
    const res = await request(app)
      .post("/api/employees/import")
      .set("Cookie", cookie)
      .attach("file", Buffer.from(csv([validRow("1")])), "employees.csv");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(ErrorCode.CSRF);
  });

  it("imports a valid file, writes audit records, and exports current salary", async () => {
    await lookups();
    const { app, cookie } = await session();
    const unpaid = csv([
      validRow("100"),
      [
        `${prefix}-101`,
        "Unpaid Uma",
        `${prefix}-Eng`,
        `${prefix}-India`,
        "true",
        "",
        "",
        "",
        "",
      ],
    ]);
    const imported = await request(app)
      .post("/api/employees/import")
      .set("Origin", APP_ORIGIN)
      .set("Cookie", cookie)
      .attach("file", Buffer.from(unpaid), "employees.csv");
    expect(imported.status).toBe(200);
    expect(imported.body.data.imported.employees).toBe(2);
    expect(imported.body.data.imported.revisions).toBe(1);

    const employee = await prisma.employee.findUniqueOrThrow({
      where: { employeeNumber: `${prefix}-100` },
    });
    const audits = await prisma.auditLog.findMany({ where: { employeeId: employee.id } });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.action).toBe("SALARY_IMPORT_CREATE");
    expect((audits[0]?.newValue as { amountMinor: string }).amountMinor).toBe("100050");

    const exported = await request(app)
      .get("/api/employees/export")
      .query({ q: prefix, status: "all" })
      .set("Cookie", cookie);
    expect(exported.status).toBe(200);
    expect(exported.headers["content-type"]).toMatch(/text\/csv/);
    expect(exported.headers["content-disposition"]).toMatch(/payscope-employees.csv/);
    expect(exported.text).toContain("1000.50");
    expect(exported.text).toContain(`${prefix}-101`);
    expect(exported.text).not.toContain("password");
  });

  it("rejects malformed headers and reports row numbers", async () => {
    await lookups();
    const { app, cookie } = await session();
    const badHeader = await request(app)
      .post("/api/employees/import")
      .set("Origin", APP_ORIGIN)
      .set("Cookie", cookie)
      .attach("file", Buffer.from("name,amount\nAda,1\n"), "bad.csv");
    expect(badHeader.status).toBe(400);
    expect(badHeader.body.error.code).toBe(ErrorCode.CSV_INVALID);
    expect(badHeader.body.error.details.rows[0].rowNumber).toBe(1);

    const badRow = await request(app)
      .post("/api/employees/import")
      .set("Origin", APP_ORIGIN)
      .set("Cookie", cookie)
      .attach("file", Buffer.from(csv([validRow("1", { amount: "-1" })])), "bad.csv");
    expect(badRow.status).toBe(400);
    expect(badRow.body.error.details.rows[0]).toMatchObject({ rowNumber: 2, field: "amount" });
  });

  it("rejects duplicate employee numbers and rolls back invalid files", async () => {
    await lookups();
    const { app, cookie } = await session();
    const duplicate = csv([validRow("200"), validRow("200", { full_name: "Other" })]);
    const dup = await request(app)
      .post("/api/employees/import")
      .set("Origin", APP_ORIGIN)
      .set("Cookie", cookie)
      .attach("file", Buffer.from(duplicate), "dup.csv");
    expect(dup.status).toBe(400);
    expect(dup.body.error.details.rows[0].field).toBe("employee_number");

    const mixed = csv([validRow("201"), validRow("202", { department: "Missing" })]);
    const rejected = await request(app)
      .post("/api/employees/import")
      .set("Origin", APP_ORIGIN)
      .set("Cookie", cookie)
      .attach("file", Buffer.from(mixed), "mixed.csv");
    expect(rejected.status).toBe(400);
    expect(await prisma.employee.count({ where: { employeeNumber: `${prefix}-201` } })).toBe(0);
  });

  it("rejects formula injection and prefixes export fields", async () => {
    const { department, country } = await lookups();
    await prisma.employee.create({
      data: {
        employeeNumber: `${prefix}-300`,
        fullName: "=cmd|",
        departmentId: department.id,
        countryId: country.id,
        isActive: true,
        updatedAt: new Date(),
      },
    });
    const { app, cookie } = await session();
    const injected = await request(app)
      .post("/api/employees/import")
      .set("Origin", APP_ORIGIN)
      .set("Cookie", cookie)
      .attach("file", Buffer.from(csv([validRow("301", { full_name: "=1+1" })])), "bad.csv");
    expect(injected.status).toBe(400);
    expect(injected.body.error.details.rows[0].field).toBe("full_name");

    const exported = await request(app)
      .get("/api/employees/export")
      .query({ q: `${prefix}-300`, status: "all" })
      .set("Cookie", cookie);
    expect(exported.text).toContain("'=cmd|");
  });

  it("returns 409 and rolls back when a snapshot version is stale", async () => {
    await lookups();
    const { app, cookie } = await session();
    const first = csv([validRow("400", { amount: "10.00" })]);
    await request(app)
      .post("/api/employees/import")
      .set("Origin", APP_ORIGIN)
      .set("Cookie", cookie)
      .attach("file", Buffer.from(first), "first.csv");

    const lookupsMap = await loadImportLookups();
    const next = csv([validRow("400", { amount: "20.00", reason: "import-correct" })]);
    const rows = validateImportCsv(next, lookupsMap, 100);
    const snapshot = await snapshotImport(rows);
    const employee = await prisma.employee.findUniqueOrThrow({
      where: { employeeNumber: `${prefix}-400` },
    });
    const revision = await prisma.salaryRevision.findFirstOrThrow({ where: { employeeId: employee.id } });
    await request(app)
      .patch(`/api/employees/${employee.id}/salary-revisions/${revision.id}`)
      .set("Origin", APP_ORIGIN)
      .set("Cookie", cookie)
      .send({ amountMinor: "1500", currencyCode: "INR", reason: "ui", expectedVersion: 1 });

    const actor = await prisma.hRUser.findFirstOrThrow({ where: { email: { startsWith: prefix } } });
    await expect(commitEmployeeImport(rows, snapshot, actor.id)).rejects.toMatchObject({
      status: 409,
      code: ErrorCode.CONFLICT,
    });
    const stored = await prisma.salaryRevision.findUniqueOrThrow({ where: { id: revision.id } });
    expect(stored.amountMinor).toBe(1500n);
    expect(stored.version).toBe(2);
    expect(
      await prisma.auditLog.count({
        where: { employeeId: employee.id, action: "SALARY_IMPORT_CORRECT" },
      }),
    ).toBe(0);
  });
});
