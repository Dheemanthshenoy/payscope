"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CsvImportSuccess, CsvRowError } from "@payscope/shared";
import { ApiClientError, exportEmployeesCsv, fetchCountries, fetchDepartments, importEmployeesCsv } from "@/lib/api";
import { csvConflictRows, csvRowErrors, mutationErrorMessage } from "@/lib/api-errors";
import { downloadBlob, formatFileSize, MAX_CSV_UPLOAD_BYTES } from "@/lib/csv-download";
import { invalidateEmployeeScope } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type StatusFilter = "active" | "inactive" | "all";

export default function ImportExportPage() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<CsvRowError[]>([]);
  const [conflictRows, setConflictRows] = useState<
    { employeeNumber: string; effectiveOn: string; message: string }[]
  >([]);
  const [importResult, setImportResult] = useState<CsvImportSuccess | null>(null);

  const [query, setQuery] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [countryId, setCountryId] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [exportError, setExportError] = useState<string | null>(null);

  const departmentsQuery = useQuery({
    queryKey: queryKeys.departments,
    queryFn: fetchDepartments,
  });
  const countriesQuery = useQuery({
    queryKey: queryKeys.countries,
    queryFn: fetchCountries,
  });
  const departments = departmentsQuery.data ?? [];
  const countries = countriesQuery.data ?? [];

  const importMutation = useMutation({
    mutationFn: (nextFile: File) => importEmployeesCsv(nextFile),
    onSuccess: async (result) => {
      setImportResult(result);
      await invalidateEmployeeScope(queryClient);
    },
  });
  const exportMutation = useMutation({
    mutationFn: () =>
      exportEmployeesCsv({
        q: query.trim() || undefined,
        departmentId: departmentId || undefined,
        countryId: countryId || undefined,
        status,
      }),
    onSuccess: (result) => {
      downloadBlob(result.blob, result.filename);
    },
  });

  async function onImport(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setImportError(null);
    setRowErrors([]);
    setConflictRows([]);
    setImportResult(null);
    if (!file) {
      setImportError("Choose a CSV file to upload.");
      return;
    }
    if (file.size > MAX_CSV_UPLOAD_BYTES) {
      setImportError(`This file is too large. The import limit is ${formatFileSize(MAX_CSV_UPLOAD_BYTES)}.`);
      return;
    }
    try {
      await importMutation.mutateAsync(file);
    } catch (err) {
      setImportError(mutationErrorMessage(err));
      if (err instanceof ApiClientError) {
        setRowErrors(csvRowErrors(err.details));
        setConflictRows(csvConflictRows(err.details));
      }
    }
  }

  async function onExport(): Promise<void> {
    setExportError(null);
    try {
      await exportMutation.mutateAsync();
    } catch (err) {
      setExportError(mutationErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import / Export</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Authenticated CSV workflows against the live directory. Invalid imports are rejected in full.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Import employees</CardTitle>
          <CardDescription>
            Upload validates every row first, then commits all rows in one transaction. If any row is
            invalid, nothing is written. A concurrent salary correction during import returns 409 and
            rolls the file back.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Use the canonical header from{" "}
            <a className="font-medium text-primary underline" href="/samples/employees.sample.csv" download>
              employees.sample.csv
            </a>
            .
          </p>
          <form className="space-y-4" onSubmit={(event) => void onImport(event)}>
            <div className="space-y-2">
              <Label htmlFor="csv-file">CSV file</Label>
              <Input
                id="csv-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setImportResult(null);
                  setImportError(null);
                  setRowErrors([]);
                  setConflictRows([]);
                }}
              />
              {file ? (
                <p className="text-sm text-muted-foreground">
                  {file.name} · {formatFileSize(file.size)}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">No file selected.</p>
              )}
            </div>
            <Button type="submit" disabled={importMutation.isPending}>
              {importMutation.isPending ? "Importing…" : "Upload CSV"}
            </Button>
          </form>
          {importResult ? (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
              Imported {importResult.imported.employees} employees and {importResult.imported.revisions}{" "}
              salary revisions.
            </p>
          ) : null}
          {importError ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {importError}
            </p>
          ) : null}
          {rowErrors.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowErrors.map((row) => (
                  <TableRow key={`${row.rowNumber}-${row.field}-${row.message}`}>
                    <TableCell>{row.rowNumber}</TableCell>
                    <TableCell>{row.field}</TableCell>
                    <TableCell>{row.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
          {conflictRows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Effective</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conflictRows.map((row) => (
                  <TableRow key={`${row.employeeNumber}-${row.effectiveOn}`}>
                    <TableCell>{row.employeeNumber}</TableCell>
                    <TableCell>{row.effectiveOn}</TableCell>
                    <TableCell>{row.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export employees</CardTitle>
          <CardDescription>
            Downloads the current directory and current salary as CSV. Filters match the employee list.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="export-search">Search</Label>
              <Input
                id="export-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name or employee number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="export-department">Department</Label>
              <Select
                id="export-department"
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
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
              <Label htmlFor="export-country">Country</Label>
              <Select id="export-country" value={countryId} onChange={(event) => setCountryId(event.target.value)}>
                <option value="">All countries</option>
                {countries.map((country) => (
                  <option key={country.id} value={country.id}>
                    {country.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="export-status">Status</Label>
              <Select
                id="export-status"
                value={status}
                onChange={(event) => setStatus(event.target.value as StatusFilter)}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="all">All</option>
              </Select>
            </div>
          </div>
          <Button type="button" variant="outline" disabled={exportMutation.isPending} onClick={() => void onExport()}>
            {exportMutation.isPending ? "Exporting…" : "Download CSV"}
          </Button>
          {exportError ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {exportError}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
