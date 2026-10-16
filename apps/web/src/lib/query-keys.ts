export type EmployeeListFilters = {
  q?: string;
  departmentId?: string;
  countryId?: string;
  status: "active" | "inactive" | "all";
  page: number;
  pageSize: number;
};

export const queryKeys = {
  analytics: ["analytics", "compensation"] as const,
  departments: ["lookups", "departments"] as const,
  countries: ["lookups", "countries"] as const,
  employees: (filters: EmployeeListFilters) => ["employees", "list", filters] as const,
  employeesRoot: ["employees"] as const,
  employee: (id: string) => ["employees", "detail", id] as const,
  salaryRevisions: (id: string) => ["employees", id, "salary-revisions"] as const,
  auditLogs: (id: string, page = 1) => ["employees", id, "audit-logs", page] as const,
};
