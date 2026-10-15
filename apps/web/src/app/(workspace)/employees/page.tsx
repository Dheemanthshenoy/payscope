"use client";

import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { EmployeeSummary } from "@payscope/shared";
import {
  ApiClientError,
  fetchCountries,
  fetchDepartments,
  fetchEmployees,
  type CountryLookup,
  type DepartmentLookup,
} from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type StatusFilter = "active" | "inactive" | "all";

export default function EmployeesPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [countryId, setCountryId] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [page, setPage] = useState(1);
  const [departments, setDepartments] = useState<DepartmentLookup[]>([]);
  const [countries, setCountries] = useState<CountryLookup[]>([]);
  const [items, setItems] = useState<EmployeeSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    void Promise.all([fetchDepartments(), fetchCountries()])
      .then(([nextDepartments, nextCountries]) => {
        setDepartments(nextDepartments);
        setCountries(nextCountries);
      })
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchEmployees({
        q: debouncedQuery || undefined,
        departmentId: departmentId || undefined,
        countryId: countryId || undefined,
        status,
        page,
        pageSize: 25,
      });
      setItems(result.items);
      setTotalCount(result.totalCount);
      setPageSize(result.pageSize);
    } catch (err) {
      setItems([]);
      setError(err instanceof ApiClientError ? err.message : "Unable to load employees.");
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, departmentId, countryId, status, page]);

  useEffect(() => {
    startTransition(() => load());
  }, [load]);

  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(totalCount / pageSize)),
    [totalCount, pageSize],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Search and filter the directory. Pagination runs on the server.
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-4 p-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="employee-search">Search</Label>
            <Input
              id="employee-search"
              value={query}
              onChange={(event) => {
                setPage(1);
                setQuery(event.target.value);
              }}
              placeholder="Name or employee number"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="department">Department</Label>
            <Select
              id="department"
              value={departmentId}
              onChange={(event) => {
                setPage(1);
                setDepartmentId(event.target.value);
              }}
            >
              <option value="">All departments</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="country">Country</Label>
            <Select
              id="country"
              value={countryId}
              onChange={(event) => {
                setPage(1);
                setCountryId(event.target.value);
              }}
            >
              <option value="">All countries</option>
              {countries.map((country) => (
                <option key={country.id} value={country.id}>
                  {country.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              id="status"
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value as StatusFilter);
              }}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}

      {!error && loading ? (
        <Skeleton className="h-80" />
      ) : null}

      {!error && !loading && items.length === 0 ? (
        <EmptyState
          title="No employees match these filters"
          description="Try a different search, status, department, or country."
        />
      ) : null}

      {!error && !loading && items.length > 0 ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Current salary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell>
                    <Link href={`/employees/${employee.id}`} className="font-medium text-primary hover:underline">
                      {employee.fullName}
                    </Link>
                    <p className="text-xs text-muted-foreground">{employee.employeeNumber}</p>
                  </TableCell>
                  <TableCell>{employee.department.name}</TableCell>
                  <TableCell>
                    {employee.country.name} ({employee.country.code})
                  </TableCell>
                  <TableCell>
                    <Badge variant={employee.isActive ? "success" : "muted"}>
                      {employee.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {employee.currentSalary
                      ? formatMoney(employee.currentSalary.amountMinor, employee.currentSalary.currencyCode)
                      : "No current salary"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
            <p>
              {totalCount} employees · page {page} of {pageCount}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= pageCount}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
