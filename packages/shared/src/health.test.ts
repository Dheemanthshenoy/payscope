import { describe, expect, it } from "vitest";
import { HealthResponseSchema } from "./health.js";

describe("HealthResponseSchema", () => {
  it("accepts { status: \"ok\" }", () => {
    expect(HealthResponseSchema.parse({ status: "ok" })).toEqual({ status: "ok" });
  });
});
