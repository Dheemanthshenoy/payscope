import { describe, expect, it } from "vitest";
import { LoginRequestSchema } from "./auth.js";

describe("LoginRequestSchema", () => {
  it("accepts a valid email and password", () => {
    expect(LoginRequestSchema.parse({ email: "hr@example.com", password: "secret" })).toEqual({
      email: "hr@example.com",
      password: "secret",
    });
  });

  it("rejects an invalid email", () => {
    expect(() => LoginRequestSchema.parse({ email: "not-an-email", password: "secret" })).toThrow();
  });
});
