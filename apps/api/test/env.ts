import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnvFile(path: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return parsed;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[trimmed.slice(0, eq)] = value;
  }
  return parsed;
}

export function applyEnv(values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) {
    if (!value.trim()) continue;
    if (!process.env[key]) process.env[key] = value;
  }
}

export function databaseName(url: string): string {
  const normalized = url.replace(/^postgres(ql)?:/i, "http:");
  const pathname = new URL(normalized).pathname.replace(/^\//, "");
  return pathname.split("/")[0] ?? "";
}

export function toTestDatabaseUrl(url: string): string {
  const name = databaseName(url);
  if (name.endsWith("_test")) {
    return url;
  }
  if (name === "payscope") {
    const httpUrl = new URL(url.replace(/^postgres(ql)?:/i, "http:"));
    httpUrl.pathname = "/payscope_test";
    return httpUrl.toString().replace(/^http:/i, url.startsWith("postgresql:") ? "postgresql:" : "postgres:");
  }
  throw new Error(
    `Refusing to derive a test database from "${name}". Set TEST_DATABASE_URL to a *_test database.`,
  );
}

export function adminDatabaseUrl(url: string): string {
  const httpUrl = new URL(url.replace(/^postgres(ql)?:/i, "http:"));
  httpUrl.pathname = "/postgres";
  const scheme = url.startsWith("postgresql:") ? "postgresql:" : "postgres:";
  return httpUrl.toString().replace(/^http:/i, scheme);
}

export function assertTestDatabase(url: string): void {
  const name = databaseName(url);
  if (!name.endsWith("_test")) {
    throw new Error(`Refusing to run API tests against database "${name}"`);
  }
}

export const apiRoot = resolve(import.meta.dirname, "..");
