import {
  ApiErrorSchema,
  ApiSuccessSchema,
  AuthUserSchema,
  CompensationAnalyticsSchema,
  EmployeeSummarySchema,
  SalaryRevisionSchema,
  type AuthUser,
  type CompensationAnalytics,
  type EmployeeSummary,
  type SalaryRevisionDto,
} from "@payscope/shared";
import { z } from "zod";

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | undefined;

export function setUnauthorizedHandler(handler?: UnauthorizedHandler): void {
  unauthorizedHandler = handler;
}

const EmployeeListSchema = z.object({
  items: z.array(EmployeeSummarySchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalCount: z.number().int(),
});

const LookupDepartmentSchema = z.object({ id: z.uuid(), name: z.string() });
const LookupCountrySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
});

const AuditLogSchema = z.object({
  id: z.uuid(),
  action: z.string(),
  employeeId: z.uuid(),
  salaryRevisionId: z.string().nullable(),
  previousValue: z.unknown(),
  newValue: z.unknown(),
  createdAt: z.string(),
  actor: z.object({ id: z.uuid(), email: z.email() }),
});

const AuditListSchema = z.object({
  items: z.array(AuditLogSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalCount: z.number().int(),
});

export type EmployeeList = z.infer<typeof EmployeeListSchema>;
export type AuditList = z.infer<typeof AuditListSchema>;
export type DepartmentLookup = z.infer<typeof LookupDepartmentSchema>;
export type CountryLookup = z.infer<typeof LookupCountrySchema>;

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  let payload: unknown = null;
  const text = await response.text();
  if (text.length > 0) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new ApiClientError(response.status, "INTERNAL", "Unexpected response from server");
    }
  }

  if (response.status === 401 && !path.startsWith("/api/auth/login")) {
    unauthorizedHandler?.();
  }

  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(payload);
    if (parsed.success) {
      throw new ApiClientError(
        response.status,
        parsed.data.error.code,
        parsed.data.error.message,
        parsed.data.error.details,
      );
    }
    throw new ApiClientError(response.status, "INTERNAL", "Request failed");
  }

  const parsed = ApiSuccessSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiClientError(response.status, "INTERNAL", "Unexpected response from server");
  }
  return parsed.data.data as T;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const data = await apiRequest<unknown>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return AuthUserSchema.parse(data);
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  return AuthUserSchema.parse(await apiRequest<unknown>("/api/auth/me"));
}

export async function logout(): Promise<void> {
  await apiRequest<void>("/api/auth/logout", { method: "POST" });
}

export async function fetchCompensation(): Promise<CompensationAnalytics> {
  return CompensationAnalyticsSchema.parse(await apiRequest<unknown>("/api/analytics/compensation"));
}

export async function fetchEmployees(params: {
  q?: string;
  departmentId?: string;
  countryId?: string;
  status?: "active" | "inactive" | "all";
  page?: number;
  pageSize?: number;
}): Promise<EmployeeList> {
  return EmployeeListSchema.parse(
    await apiRequest<unknown>(`/api/employees${queryString(params)}`),
  );
}

export async function fetchEmployee(id: string): Promise<EmployeeSummary> {
  return EmployeeSummarySchema.parse(await apiRequest<unknown>(`/api/employees/${id}`));
}

export async function fetchDepartments(): Promise<DepartmentLookup[]> {
  return z.array(LookupDepartmentSchema).parse(await apiRequest<unknown>("/api/departments"));
}

export async function fetchCountries(): Promise<CountryLookup[]> {
  return z.array(LookupCountrySchema).parse(await apiRequest<unknown>("/api/countries"));
}

export async function fetchSalaryRevisions(employeeId: string): Promise<SalaryRevisionDto[]> {
  return z
    .array(SalaryRevisionSchema)
    .parse(await apiRequest<unknown>(`/api/employees/${employeeId}/salary-revisions`));
}

export async function fetchEmployeeAuditLogs(
  employeeId: string,
  page = 1,
): Promise<AuditList> {
  return AuditListSchema.parse(
    await apiRequest<unknown>(`/api/employees/${employeeId}/audit-logs${queryString({ page })}`),
  );
}
