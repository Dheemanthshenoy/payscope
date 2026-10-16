"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { CURRENCY_CODES } from "@payscope/shared";
import { createSalaryRevision } from "@/lib/api";
import { invalidateEmployeeScope } from "@/lib/query-client";
import { applySalaryMutation } from "@/lib/salary-actions";
import {
  SalaryCreateFormSchema,
  buildCreateSalaryRevision,
  defaultCreateSalaryValues,
  type SalaryCreateFormValues,
} from "@/lib/salary-form";
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
import { Textarea } from "@/components/ui/textarea";

export function SalaryRevisionDialog({
  employeeId,
  defaultCurrency,
  open,
  onOpenChange,
}: {
  employeeId: string;
  defaultCurrency?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<SalaryCreateFormValues>({
    resolver: zodResolver(SalaryCreateFormSchema),
    defaultValues: defaultCreateSalaryValues(defaultCurrency),
  });

  useEffect(() => {
    if (open) {
      form.reset(defaultCreateSalaryValues(defaultCurrency));
      setFormError(null);
    }
  }, [defaultCurrency, form, open]);

  async function onSubmit(values: SalaryCreateFormValues): Promise<void> {
    const built = buildCreateSalaryRevision(values);
    if (!built.payload) return;
    setSubmitting(true);
    setFormError(null);
    const result = await applySalaryMutation({
      mutate: () => createSalaryRevision(employeeId, built.payload!),
      refresh: () => invalidateEmployeeScope(queryClient, employeeId),
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
          <DialogTitle>Add salary revision</DialogTitle>
          <DialogDescription>
            Annual base salary in major units. Stored as integer minor units. A new effective date
            creates a revision; use Correct for the same date.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit((values) => void onSubmit(values))} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Annual salary</FormLabel>
                    <FormControl>
                      <Input {...field} inputMode="decimal" placeholder="120000.00" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="currencyCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <FormControl>
                      <Select {...field}>
                        {CURRENCY_CODES.map((code) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ))}
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="effectiveOn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Effective date (UTC)</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason (optional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} maxLength={500} />
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
                {submitting ? "Saving…" : "Save revision"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
