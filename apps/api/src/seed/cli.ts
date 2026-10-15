import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { seedPayscope } from "./seed.js";
import { assertSeedAllowed } from "./guard.js";
import { SEED_EMPLOYEE_COUNT } from "./catalog.js";

loadDotenv({ path: resolve(process.cwd(), ".env") });
loadDotenv({ path: resolve(process.cwd(), "../../.env") });

function argValue(argv: string[], name: string): string | undefined {
  const prefix = `${name}=`;
  const found = argv.find((value) => value.startsWith(prefix));
  return found?.slice(prefix.length);
}

const argv = process.argv.slice(2);
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed");
}

assertSeedAllowed({
  databaseUrl,
  nodeEnv: process.env.NODE_ENV ?? "development",
  argv,
  confirmEnv: process.env.PAYSCOPE_SEED_CONFIRM,
  allowTestEnv: process.env.PAYSCOPE_SEED_ALLOW_TEST,
});

const count = Number(argValue(argv, "--count") ?? SEED_EMPLOYEE_COUNT);
if (!Number.isInteger(count) || count < 1) {
  throw new Error("--count must be a positive integer");
}

const options: { employeeCount: number; hrEmail?: string; hrPassword?: string } = {
  employeeCount: count,
};
const hrEmail = process.env.HR_EMAIL?.trim();
const hrPassword = process.env.HR_PASSWORD?.trim();
if (hrEmail && hrPassword) {
  options.hrEmail = hrEmail;
  options.hrPassword = hrPassword;
}

const result = await seedPayscope(options);

console.log(
  `Seed complete: ${result.employeesCreated} employees created, ${result.employeesSkipped} skipped, ${result.revisionsCreated} revisions created`,
);
