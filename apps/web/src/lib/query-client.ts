import { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: false,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export async function invalidateEmployeeScope(
  queryClient: QueryClient,
  employeeId?: string,
): Promise<void> {
  const tasks = [
    queryClient.invalidateQueries({ queryKey: queryKeys.employeesRoot }),
    queryClient.invalidateQueries({ queryKey: queryKeys.analytics }),
  ];
  if (employeeId) {
    tasks.push(
      queryClient.invalidateQueries({ queryKey: queryKeys.employee(employeeId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.salaryRevisions(employeeId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.auditLogs(employeeId) }),
    );
  }
  await Promise.all(tasks);
}
