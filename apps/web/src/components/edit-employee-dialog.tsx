"use client";

import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import type { EmployeeSummary } from "@payscope/shared";
import { updateEmployee, type CountryLookup, type DepartmentLookup } from "@/lib/api";
import {
  UpdateEmployeeFormSchema,
  defaultUpdateEmployeeValues,
  type UpdateEmployeeFormValues,
} from "@/lib/employee-form";
import { invalidateEmployeeScope } from "@/lib/query-client";
import { applyWriteMutation } from "@/lib/salary-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export function EditEmployeeDialog({
  employee,
  open,
  onOpenChange,
  departments,
  countries,
}: {
  employee: EmployeeSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departments: DepartmentLookup[];
  countries: CountryLookup[];
}) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const employeeRef = useRef(employee);
  employeeRef.current = employee;
  const form = useForm<UpdateEmployeeFormValues>({
    resolver: zodResolver(UpdateEmployeeFormSchema),
    defaultValues: defaultUpdateEmployeeValues(employee),
  });

  useEffect(() => {
    if (!open) return;
    form.reset(defaultUpdateEmployeeValues(employeeRef.current));
    setFormError(null);
  }, [form, open]);

  async function onSubmit(values: UpdateEmployeeFormValues): Promise<void> {
    setSubmitting(true);
    setFormError(null);
    const result = await applyWriteMutation({
      mutate: () => updateEmployee(employee.id, values),
      refresh: () => invalidateEmployeeScope(queryClient, employee.id),
    });
    setSubmitting(false);
    if (result.ok) {
      onOpenChange(false);
      return;
    }
    if (!result.cancelled) {
      setFormError(result.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit employee</DialogTitle>
          <DialogDescription>
            Name, department, and country can change. The employee number stays {employee.employeeNumber}.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit((values) => void onSubmit(values))} noValidate>
            <div className="space-y-2">
              <Label>Employee number</Label>
              <Input value={employee.employeeNumber} readOnly disabled />
            </div>
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full name</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="departmentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Department</FormLabel>
                  <FormControl>
                    <Select {...field}>
                      {departments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="countryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Country</FormLabel>
                  <FormControl>
                    <Select {...field}>
                      {countries.map((country) => (
                        <option key={country.id} value={country.id}>
                          {country.name}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {formError ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                {formError}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
