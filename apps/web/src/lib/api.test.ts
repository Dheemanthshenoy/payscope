import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, apiRequest, login, setUnauthorizedHandler } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(undefined);
});

describe("apiRequest", () => {
  it("returns data from the success envelope and sends credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ success: true, message: "OK", data: { id: "1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest<{ id: string }>("/api/employees")).resolves.toEqual({ id: "1" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/employees",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("maps backend error envelopes and notifies on 401", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      text: async () =>
        JSON.stringify({
          success: false,
          error: { code: "UNAUTHENTICATED", message: "Authentication required" },
        }),
    }));

    await expect(apiRequest("/api/employees")).rejects.toMatchObject({
      name: "ApiClientError",
      status: 401,
      code: "UNAUTHENTICATED",
    });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("does not treat failed login as a session expiry", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      text: async () =>
        JSON.stringify({
          success: false,
          error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" },
        }),
    }));

    await expect(login("hr@example.com", "wrong")).rejects.toBeInstanceOf(ApiClientError);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
