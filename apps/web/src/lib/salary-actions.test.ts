import { describe, expect, it, vi } from "vitest";
import { ApiClientError } from "./api";
import { applyDeactivation, applySalaryMutation } from "./salary-actions";

describe("applySalaryMutation", () => {
  it("refreshes current salary, history, and audit after a successful write", async () => {
    const mutate = vi.fn().mockResolvedValue({ id: "rev-1" });
    const refresh = vi.fn().mockResolvedValue(undefined);
    await expect(applySalaryMutation({ mutate, refresh })).resolves.toEqual({ ok: true });
    expect(mutate).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("refreshes after a 409 so the form sees the latest version", async () => {
    const mutate = vi.fn().mockRejectedValue(
      new ApiClientError(409, "CONFLICT", "Salary revision was updated by someone else"),
    );
    const refresh = vi.fn().mockResolvedValue(undefined);
    await expect(applySalaryMutation({ mutate, refresh })).resolves.toEqual({
      ok: false,
      conflict: true,
      message: "Salary revision was updated by someone else",
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("does not refresh on validation errors", async () => {
    const mutate = vi.fn().mockRejectedValue(new ApiClientError(400, "VALIDATION", "Invalid request"));
    const refresh = vi.fn().mockResolvedValue(undefined);
    await expect(applySalaryMutation({ mutate, refresh })).resolves.toMatchObject({
      ok: false,
      conflict: false,
      message: "Invalid request",
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("applyDeactivation", () => {
  it("does not call the API when the confirmation is cancelled", async () => {
    const mutate = vi.fn();
    const refresh = vi.fn();
    await expect(applyDeactivation({ confirmed: false, mutate, refresh })).resolves.toEqual({
      ok: false,
      cancelled: true,
    });
    expect(mutate).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("deactivates and refreshes after confirmation", async () => {
    const mutate = vi.fn().mockResolvedValue({ isActive: false });
    const refresh = vi.fn().mockResolvedValue(undefined);
    await expect(applyDeactivation({ confirmed: true, mutate, refresh })).resolves.toEqual({ ok: true });
    expect(mutate).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });
});
