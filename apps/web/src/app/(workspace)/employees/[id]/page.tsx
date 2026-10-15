"use client";

import { startTransition, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { EmployeeSummary, SalaryRevisionDto, SalarySnapshot } from "@payscope/shared";
import {
  ApiClientError,
  fetchEmployee,
  fetchEmployeeAuditLogs,
  fetchSalaryRevisions,
  type AuditList,
} from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function snapshotText(value: unknown): string {
  if (!value || typeof value !== "object") return "—";
  const snapshot = value as Partial<SalarySnapshot>;
  if (!snapshot.amountMinor || !snapshot.currencyCode) return "—";
  return `${formatMoney(snapshot.amountMinor, snapshot.currencyCode)} · ${snapshot.effectiveOn ?? ""}`;
}

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [employee, setEmployee] = useState<EmployeeSummary | null>(null);
  const [revisions, setRevisions] = useState<SalaryRevisionDto[]>([]);
  const [audits, setAudits] = useState<AuditList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        nextEmployee,
        nextRevisions,
        nextAudits
      ] = await Promise.all([
        fetchEmployee(id),
        fetchSalaryRevisions(id),
        fetchEmployeeAuditLogs(id),
      ]);
      setEmployee(nextEmployee);
      setRevisions(nextRevisions);
      setAudits(nextAudits);
    } catch (err) {
      setEmployee(null);
      setError(err instanceof ApiClientError ? err.message : "Unable to load this employee.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    startTransition(() => load());
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/employees">Back to directory</Link>
        </Button>
        <ErrorState message={error ?? "Employee not found."} onRetry={() => void load()} />
      </div>
    );
  }

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
        <Badge variant={employee.isActive ? "success" : "muted"}>
          {employee.isActive ? "Active" : "Inactive"}
        </Badge>
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
          <CardHeader>
            <CardTitle>Current salary</CardTitle>
            <CardDescription>Latest revision effective on or before today UTC.</CardDescription>
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

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>Salary changes</CardTitle>
          <CardDescription>
            Creating and correcting revisions will be added in Milestone 8B. History below is read-only.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Salary history</CardTitle>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {revisions.map((revision) => (
                  <TableRow key={revision.id}>
                    <TableCell>{revision.effectiveOn}</TableCell>
                    <TableCell>{formatMoney(revision.amountMinor, revision.currencyCode)}</TableCell>
                    <TableCell>{revision.reason ?? "—"}</TableCell>
                    <TableCell>{revision.version}</TableCell>
                  </TableRow>
                ))}
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
            <EmptyState title="No audit records" description="Salary mutations for this employee will appear here." />
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
    </div>
  );
}
