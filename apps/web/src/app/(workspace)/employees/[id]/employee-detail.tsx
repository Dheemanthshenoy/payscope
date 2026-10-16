"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { SalaryRevisionDto } from "@payscope/shared";
import { DeactivateEmployeeDialog } from "@/components/deactivate-employee-dialog";
import { EditEmployeeDialog } from "@/components/edit-employee-dialog";
import { SalaryCorrectDialog } from "@/components/salary-correct-dialog";
import { SalaryRevisionDialog } from "@/components/salary-revision-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { snapshotText } from "@/lib/audit-snapshot";
import {
  ApiClientError,
  fetchCountries,
  fetchDepartments,
  fetchEmployee,
  fetchEmployeeAuditLogs,
  fetchSalaryRevisions,
} from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { isFutureEffectiveOn } from "@/lib/salary-form";

export function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [correcting, setCorrecting] = useState<SalaryRevisionDto | null>(null);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  const employeeQuery = useQuery({
    queryKey: queryKeys.employee(id),
    queryFn: () => fetchEmployee(id),
  });
  const revisionsQuery = useQuery({
    queryKey: queryKeys.salaryRevisions(id),
    queryFn: () => fetchSalaryRevisions(id),
  });
  const auditsQuery = useQuery({
    queryKey: queryKeys.auditLogs(id),
    queryFn: () => fetchEmployeeAuditLogs(id),
  });
  const departmentsQuery = useQuery({
    queryKey: queryKeys.departments,
    queryFn: fetchDepartments,
  });
  const countriesQuery = useQuery({
    queryKey: queryKeys.countries,
    queryFn: fetchCountries,
  });

  const loading = employeeQuery.isLoading || revisionsQuery.isLoading || auditsQuery.isLoading;
  const error =
    firstQueryError(employeeQuery.error, revisionsQuery.error, auditsQuery.error) ??
    (!employeeQuery.data && !loading ? "Employee not found." : null);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !employeeQuery.data) {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/employees">Back to directory</Link>
        </Button>
        <ErrorState
          message={error ?? "Employee not found."}
          onRetry={() => {
            void employeeQuery.refetch();
            void revisionsQuery.refetch();
            void auditsQuery.refetch();
          }}
        />
      </div>
    );
  }

  const employee = employeeQuery.data;
  const revisions = revisionsQuery.data ?? [];
  const audits = auditsQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 px-0 text-muted-foreground">
            <Link href="/employees">← Employees</Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">{employee.fullName}</h1>
          <p className="text-sm text-muted-foreground">{employee.employeeNumber}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={employee.isActive ? "success" : "muted"}>
            {employee.isActive ? "Active" : "Inactive"}
          </Badge>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            Edit Employee
          </Button>
          {employee.isActive ? (
            <Button type="button" variant="destructive" size="sm" onClick={() => setDeactivateOpen(true)}>
              Deactivate
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Department:</span> {employee.department.name}
            </p>
            <p>
              <span className="text-muted-foreground">Country:</span> {employee.country.name} ({employee.country.code})
            </p>
            {employee.deactivatedAt ? (
              <p>
                <span className="text-muted-foreground">Deactivated:</span> {formatDateTime(employee.deactivatedAt)}
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1.5">
              <CardTitle>Current salary</CardTitle>
              <CardDescription>Latest revision effective on or before today UTC.</CardDescription>
            </div>
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              Add revision
            </Button>
          </CardHeader>
          <CardContent>
            {employee.currentSalary ? (
              <div className="space-y-1">
                <p className="text-2xl font-semibold">
                  {formatMoney(employee.currentSalary.amountMinor, employee.currentSalary.currencyCode)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Effective {employee.currentSalary.effectiveOn}
                  {employee.currentSalary.reason ? ` · ${employee.currentSalary.reason}` : ""}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No current salary.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Salary history</CardTitle>
          <CardDescription>
            Future-dated revisions stay in history and do not change current pay until their UTC date.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {revisions.length === 0 ? (
            <EmptyState title="No salary revisions" description="This employee has no recorded pay history." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Effective</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revisions.map((revision) => {
                  const future = isFutureEffectiveOn(revision.effectiveOn);
                  return (
                    <TableRow key={revision.id} className={future ? "bg-amber-50/40" : undefined}>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{revision.effectiveOn}</span>
                          {future ? <Badge variant="warning">Future</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell>{formatMoney(revision.amountMinor, revision.currencyCode)}</TableCell>
                      <TableCell>{revision.reason ?? "—"}</TableCell>
                      <TableCell>{revision.version}</TableCell>
                      <TableCell className="text-right">
                        <Button type="button" variant="outline" size="sm" onClick={() => setCorrecting(revision)}>
                          Correct
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit log</CardTitle>
        </CardHeader>
        <CardContent>
          {!audits || audits.items.length === 0 ? (
            <EmptyState
              title="No audit records"
              description="Identity and salary mutations for this employee will appear here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Previous</TableHead>
                  <TableHead>New</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audits.items.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{formatDateTime(log.createdAt)}</TableCell>
                    <TableCell>{log.action}</TableCell>
                    <TableCell>{log.actor.email}</TableCell>
                    <TableCell>{snapshotText(log.previousValue)}</TableCell>
                    <TableCell>{snapshotText(log.newValue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SalaryRevisionDialog
        employeeId={employee.id}
        defaultCurrency={employee.currentSalary?.currencyCode}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
      <SalaryCorrectDialog
        employeeId={employee.id}
        revision={correcting}
        open={correcting !== null}
        onOpenChange={(open) => {
          if (!open) setCorrecting(null);
        }}
      />
      <EditEmployeeDialog
        employee={employee}
        open={editOpen}
        onOpenChange={setEditOpen}
        departments={departmentsQuery.data ?? []}
        countries={countriesQuery.data ?? []}
      />
      <DeactivateEmployeeDialog
        employeeId={employee.id}
        employeeName={employee.fullName}
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
      />
    </div>
  );
}

function firstQueryError(...errors: unknown[]): string | null {
  for (const err of errors) {
    if (err instanceof ApiClientError) return err.message;
    if (err) return "Unable to load this employee.";
  }
  return null;
}
