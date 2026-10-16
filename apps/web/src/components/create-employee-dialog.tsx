"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { createEmployee } from "@/lib/api";
import {
  CreateEmployeeFormSchema,
  defaultCreateEmployeeValues,
  type CreateEmployeeFormValues,
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
import { Select } from "@/components/ui/select";
import type { CountryLookup, DepartmentLookup } from "@/lib/api";

export function CreateEmployeeDialog({
  open,
  onOpenChange,
  departments,
  countries,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departments: DepartmentLookup[];
  countries: CountryLookup[];
}) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<CreateEmployeeFormValues>({
    resolver: zodResolver(CreateEmployeeFormSchema),
    defaultValues: defaultCreateEmployeeValues(),
  });

  useEffect(() => {
    if (open) {
      form.reset(defaultCreateEmployeeValues());
      setFormError(null);
    }
  }, [form, open]);

  async function onSubmit(values: CreateEmployeeFormValues): Promise<void> {
    setSubmitting(true);
    setFormError(null);
    const result = await applyWriteMutation({
      mutate: () => createEmployee({ ...values, isActive: true }),
      refresh: () => invalidateEmployeeScope(queryClient),
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
          <DialogTitle>Add employee</DialogTitle>
          <DialogDescription>
            Creates a directory record. Salary can be added later from the employee profile.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit((values) => void onSubmit(values))} noValidate>
            <FormField
              control={form.control}
              name="employeeNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Employee number</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="off" placeholder="E-1001" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full name</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="name" placeholder="Ada Lovelace" />
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
                      <option value="">Select department</option>
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
                      <option value="">Select country</option>
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
                {submitting ? "Saving…" : "Create employee"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
