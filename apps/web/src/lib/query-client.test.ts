import { describe, expect, it, vi } from "vitest";
import { invalidateEmployeeScope, makeQueryClient } from "./query-client";
import { queryKeys } from "./query-keys";

describe("invalidateEmployeeScope", () => {
  it("invalidates directory, analytics, and the employee detail keys", async () => {
    const queryClient = makeQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    await invalidateEmployeeScope(queryClient, "emp-1");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.employeesRoot });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.analytics });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.employee("emp-1") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.salaryRevisions("emp-1") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.auditLogs("emp-1") });
  });
});
