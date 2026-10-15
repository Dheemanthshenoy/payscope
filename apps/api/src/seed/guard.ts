export type SeedGuardInput = {
  databaseUrl: string;
  nodeEnv: string;
  argv: string[];
  confirmEnv?: string;
  allowTestEnv?: string;
};

export function assertSeedAllowed(input: SeedGuardInput): void {
  const dbName = databaseName(input.databaseUrl);
  const confirm = input.argv.includes("--confirm") && input.confirmEnv === "PAYSCOPE_SEED";
  const allowTest = input.argv.includes("--allow-test") || input.allowTestEnv === "1";

  if (dbName.endsWith("_test")) {
    if (!allowTest) {
      throw new Error("Refusing to seed a test database without --allow-test or PAYSCOPE_SEED_ALLOW_TEST=1");
    }
    return;
  }

  const productionLike = input.nodeEnv === "production" || dbName !== "payscope";
  if (productionLike && !confirm) {
    throw new Error(
      "Refusing to seed a non-development database. Pass --confirm and set PAYSCOPE_SEED_CONFIRM=PAYSCOPE_SEED",
    );
  }
  if (!confirm) {
    throw new Error("Seed requires explicit --confirm and PAYSCOPE_SEED_CONFIRM=PAYSCOPE_SEED");
  }
}

export function databaseName(url: string): string {
  const parsed = new URL(url);
  return decodeURIComponent(parsed.pathname.replace(/^\//, "").split("/")[0] ?? "");
}
