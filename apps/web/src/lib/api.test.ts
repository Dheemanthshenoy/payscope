import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiClientError,
  apiRequest,
  createEmployee,
  createSalaryRevision,
  exportEmployeesCsv,
  importEmployeesCsv,
  login,
  setUnauthorizedHandler,
  updateEmployee,
} from "./api";

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

describe("employee create and edit clients", () => {
  it("creates an employee with JSON credentials and no salary", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          message: "Employee created",
          data: {
            id: "11111111-1111-4111-8111-111111111111",
            employeeNumber: "E-8B-100",
            fullName: "New Nina",
            department: { id: "33333333-3333-4333-8333-333333333333", name: "Engineering" },
            country: { id: "44444444-4444-4444-8444-444444444444", code: "IN", name: "India" },
            isActive: true,
            deactivatedAt: null,
            currentSalary: null,
          },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const created = await createEmployee({
      employeeNumber: "E-8B-100",
      fullName: "New Nina",
      departmentId: "33333333-3333-4333-8333-333333333333",
      countryId: "44444444-4444-4444-8444-444444444444",
      isActive: true,
    });
    expect(created.currentSalary).toBeNull();
    expect(created.employeeNumber).toBe("E-8B-100");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({ employeeNumber: "E-8B-100" });
  });

  it("updates editable identity fields and surfaces 409 conflicts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            message: "Employee updated",
            data: {
              id: "11111111-1111-4111-8111-111111111111",
              employeeNumber: "E-8B-100",
              fullName: "Nina Edited",
              department: { id: "33333333-3333-4333-8333-333333333333", name: "Engineering" },
              country: { id: "44444444-4444-4444-8444-444444444444", code: "IN", name: "India" },
              isActive: true,
              deactivatedAt: null,
              currentSalary: null,
            },
          }),
      }),
    );
    const updated = await updateEmployee("11111111-1111-4111-8111-111111111111", {
      fullName: "Nina Edited",
      departmentId: "33333333-3333-4333-8333-333333333333",
      countryId: "44444444-4444-4444-8444-444444444444",
    });
    expect(updated.fullName).toBe("Nina Edited");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 409,
        ok: false,
        text: async () =>
          JSON.stringify({
            success: false,
            error: { code: "CONFLICT", message: "An employee with this employee number already exists" },
          }),
      }),
    );
    await expect(
      createEmployee({
        employeeNumber: "E-8B-100",
        fullName: "Copy",
        departmentId: "33333333-3333-4333-8333-333333333333",
        countryId: "44444444-4444-4444-8444-444444444444",
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT",
      message: "An employee with this employee number already exists",
    });
  });
});

describe("salary and CSV clients", () => {
  it("creates a revision with a string amountMinor", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          message: "Salary revision created",
          data: {
            id: "11111111-1111-4111-8111-111111111111",
            employeeId: "22222222-2222-4222-8222-222222222222",
            amountMinor: "14500050",
            currencyCode: "USD",
            effectiveOn: "2026-03-01",
            reason: "offer",
            version: 1,
            createdAt: "2026-10-15T00:00:00.000Z",
            updatedAt: "2026-10-15T00:00:00.000Z",
          },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const revision = await createSalaryRevision("22222222-2222-4222-8222-222222222222", {
      amountMinor: "14500050",
      currencyCode: "USD",
      effectiveOn: "2026-03-01",
      reason: "offer",
    });
    expect(revision.amountMinor).toBe("14500050");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ amountMinor: "14500050" });
  });

  it("uploads CSV as FormData file without setting Content-Type", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          message: "CSV imported",
          data: { imported: { employees: 2, revisions: 1 } },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["employee_number,full_name\n"], "employees.csv", { type: "text/csv" });
    await expect(importEmployeesCsv(file)).resolves.toEqual({ imported: { employees: 2, revisions: 1 } });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBe(file);
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
  });

  it("surfaces CSV validation details on 400", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 400,
        ok: false,
        text: async () =>
          JSON.stringify({
            success: false,
            error: {
              code: "CSV_INVALID",
              message: "CSV file is invalid",
              details: { rows: [{ rowNumber: 2, field: "amount", message: "bad amount" }] },
            },
          }),
      }),
    );
    const file = new File(["bad"], "bad.csv", { type: "text/csv" });
    await expect(importEmployeesCsv(file)).rejects.toMatchObject({
      status: 400,
      code: "CSV_INVALID",
      details: { rows: [{ rowNumber: 2, field: "amount", message: "bad amount" }] },
    });
  });

  it("downloads CSV text separately from the JSON envelope", async () => {
    const csv = "employee_number,full_name\nE-1,Ada\n";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        headers: new Headers({
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="payscope-employees.csv"',
        }),
        blob: async () => new Blob([csv], { type: "text/csv" }),
      }),
    );
    const result = await exportEmployeesCsv({ status: "active" });
    expect(result.filename).toBe("payscope-employees.csv");
    expect(await result.blob.text()).toBe(csv);
  });

  it("keeps export errors on the page as ApiClientError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 403,
        ok: false,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({
            success: false,
            error: { code: "CSRF", message: "Untrusted origin" },
          }),
      }),
    );
    await expect(exportEmployeesCsv()).rejects.toMatchObject({ status: 403, code: "CSRF" });
  });
});
