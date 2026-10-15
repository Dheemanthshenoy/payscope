import { describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import { sendError, sendSuccess } from "../src/utils/api-response.js";

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    ended: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
  return res as typeof res & Response;
}

describe("api-response", () => {
  it("sends the success envelope", () => {
    const res = mockRes();
    sendSuccess(res, 200, "OK", { status: "ok" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, message: "OK", data: { status: "ok" } });
  });

  it("sends no body for 204", () => {
    const res = mockRes();
    const json = vi.spyOn(res, "json");
    sendSuccess(res, 204, "Logged out");
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    expect(json).not.toHaveBeenCalled();
  });

  it("sends the error envelope", () => {
    const res = mockRes();
    sendError(res, 401, "UNAUTHENTICATED", "Authentication required");
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      success: false,
      error: { code: "UNAUTHENTICATED", message: "Authentication required" },
    });
  });
});
