import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  adminDatabaseUrl,
  apiRoot,
  applyEnv,
  assertTestDatabase,
  databaseName,
  loadEnvFile,
  toTestDatabaseUrl,
} from "./env.js";

applyEnv(loadEnvFile(resolve(apiRoot, ".env")));
applyEnv(loadEnvFile(resolve(apiRoot, "../../.env")));

process.env.NODE_ENV = "test";
process.env.APP_ORIGIN = process.env.APP_ORIGIN?.trim() || "http://localhost:3000";
process.env.SESSION_SECRET = process.env.SESSION_SECRET?.trim() || "test-session-secret-value";
process.env.AUTH_LOGIN_RATE_LIMIT_MAX = process.env.AUTH_LOGIN_RATE_LIMIT_MAX?.trim() || "100";
process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS =
  process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS?.trim() || "60000";
process.env.CSV_IMPORT_RATE_LIMIT_MAX = process.env.CSV_IMPORT_RATE_LIMIT_MAX?.trim() || "100";

const sourceUrl = process.env.TEST_DATABASE_URL?.trim() || process.env.DATABASE_URL;
if (!sourceUrl) {
  throw new Error("DATABASE_URL or TEST_DATABASE_URL is required for API tests");
}

const testUrl = process.env.TEST_DATABASE_URL?.trim() || toTestDatabaseUrl(sourceUrl);
assertTestDatabase(testUrl);
process.env.DATABASE_URL = testUrl;
process.env.TEST_DATABASE_URL = testUrl;

async function ensureTestDatabase(url: string): Promise<void> {
  const name = databaseName(url);
  const admin = new PrismaClient({ datasources: { db: { url: adminDatabaseUrl(url) } } });
  try {
    const rows = await admin.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = ${name}) AS exists
    `;
    if (!rows[0]?.exists) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await admin.$disconnect();
  }
}

await ensureTestDatabase(testUrl);

try {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: apiRoot,
    env: process.env,
    encoding: "utf8",
  });
} catch (err) {
  const stderr = err && typeof err === "object" && "stderr" in err ? String(err.stderr) : "";
  throw new Error(
    `Could not migrate test database. Create payscope_test and retry. ${stderr || String(err)}`,
  );
}
