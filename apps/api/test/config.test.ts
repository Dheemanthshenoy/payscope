import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("requires SESSION_SECRET, DATABASE_URL, and APP_ORIGIN", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "test",
      }),
    ).toThrow(/SESSION_SECRET/);
  });

  it("rejects a non-origin APP_ORIGIN", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "test",
        SESSION_SECRET: "test-session-secret-value",
        DATABASE_URL: "postgresql://localhost:5432/payscope_test",
        APP_ORIGIN: "http://localhost:3000/app",
      }),
    ).toThrow(/APP_ORIGIN/);
  });
});
