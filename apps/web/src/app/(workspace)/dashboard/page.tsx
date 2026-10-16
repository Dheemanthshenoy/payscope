"use client";

import { useQuery } from "@tanstack/react-query";
import type { CompensationAnalytics, CurrencyStats } from "@payscope/shared";
import { ApiClientError, fetchCompensation } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Skeleton } from "@/components/ui/skeleton";

type CurrencyTotal = {
  currencyCode: string;
  compensatedEmployeeCount: number;
  total: string;
};

function summarize(data: CompensationAnalytics) {
  const activeEmployeeCount = data.byDepartment.reduce((sum, row) => sum + row.activeEmployeeCount, 0);
  const compensatedEmployeeCount = data.byDepartment.reduce(
    (sum, row) => sum + row.compensatedEmployeeCount,
    0,
  );
  const byCurrency = new Map<string, { count: number; total: bigint }>();
  for (const department of data.byDepartment) {
    for (const currency of department.byCurrency) {
      const current = byCurrency.get(currency.currencyCode) ?? { count: 0, total: BigInt(0) };
      current.count += currency.compensatedEmployeeCount;
      current.total += BigInt(currency.total);
      byCurrency.set(currency.currencyCode, current);
    }
  }
  const currencyTotals: CurrencyTotal[] = [...byCurrency.entries()]
    .map(([currencyCode, value]) => ({
      currencyCode,
      compensatedEmployeeCount: value.count,
      total: value.total.toString(10),
    }))
    .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));
  return { activeEmployeeCount, compensatedEmployeeCount, currencyTotals };
}

function statText(value: string | null, currencyCode: string): string {
  return value == null ? "—" : formatMoney(value, currencyCode);
}

function CurrencyRows({ rows }: { rows: CurrencyStats[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No current salaries in this group.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Currency</TableHead>
          <TableHead>Compensated</TableHead>
          <TableHead>Min</TableHead>
          <TableHead>Median</TableHead>
          <TableHead>Average</TableHead>
          <TableHead>Max</TableHead>
          <TableHead>Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.currencyCode}>
            <TableCell>
              <Badge>{row.currencyCode}</Badge>
            </TableCell>
            <TableCell>{row.compensatedEmployeeCount}</TableCell>
            <TableCell>{statText(row.minimum, row.currencyCode)}</TableCell>
            <TableCell>{statText(row.median, row.currencyCode)}</TableCell>
            <TableCell>{statText(row.average, row.currencyCode)}</TableCell>
            <TableCell>{statText(row.maximum, row.currencyCode)}</TableCell>
            <TableCell>{formatMoney(row.total, row.currencyCode)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function DashboardPage() {
  const analyticsQuery = useQuery({
    queryKey: queryKeys.analytics,
    queryFn: fetchCompensation,
  });
  const data = analyticsQuery.data ?? null;
  const loading = analyticsQuery.isLoading;
  const error =
    analyticsQuery.error instanceof ApiClientError
      ? analyticsQuery.error.message
      : analyticsQuery.error
        ? "Unable to load compensation analytics."
        : null;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => void analyticsQuery.refetch()} />;
  }

  if (!data || (data.byDepartment.length === 0 && data.byCountry.length === 0)) {
    return (
      <EmptyState
        title="No compensation snapshot yet"
        description="Analytics appear after active employees and current salaries exist in the directory."
      />
    );
  }

  const summary = summarize(data);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Current UTC snapshot. Totals stay in their own currency.
        </p>
      </div>

      <section className="grid gap-2 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Active Employees</CardDescription>
            <CardTitle className="text-3xl">{summary.activeEmployeeCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>With Current Salary</CardDescription>
            <CardTitle className="text-3xl">{summary.compensatedEmployeeCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Unpaid (Active)</CardDescription>
            <CardTitle className="text-3xl">
              {summary.activeEmployeeCount - summary.compensatedEmployeeCount}
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {summary.currencyTotals.map((row) => (
          <Card key={row.currencyCode}>
            <CardHeader>
              <CardDescription>{row.currencyCode} Annual Base</CardDescription>
              <CardTitle className="text-xl">{formatMoney(row.total, row.currencyCode)}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {row.compensatedEmployeeCount} Employees
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-2">
        <div>
          <h2 className="text-lg font-semibold">By Department</h2>
          <p className="text-sm text-muted-foreground">Compensation totals by department based on the active employees in that department.</p>
        </div>
        {data.byDepartment.map((row) => (
          <Card key={row.department.id}>
            <CardHeader>
              <CardTitle>{row.department.name}</CardTitle>
              <CardDescription>
                {row.activeEmployeeCount} Active - {row.compensatedEmployeeCount} Compensated
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CurrencyRows rows={row.byCurrency} />
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-2">
        <div>
          <h2 className="text-lg font-semibold">By Country</h2>
          <p className="text-sm text-muted-foreground">Compensation totals by country based on the active employees in that country.</p>
        </div>
        {data.byCountry.map((row) => (
          <Card key={row.country.id}>
            <CardHeader>
              <CardTitle>
                {row.country.name}{" "}
                <span className="text-sm font-normal text-muted-foreground">{row.country.code}</span>
              </CardTitle>
              <CardDescription>
                {row.activeEmployeeCount} Active - {row.compensatedEmployeeCount} Compensated
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CurrencyRows rows={row.byCurrency} />
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
