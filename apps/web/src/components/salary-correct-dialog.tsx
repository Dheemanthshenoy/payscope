"use client";

import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { CURRENCY_CODES, type SalaryRevisionDto } from "@payscope/shared";
import { correctSalaryRevision } from "@/lib/api";
import { invalidateEmployeeScope } from "@/lib/query-client";
import { applySalaryMutation } from "@/lib/salary-actions";
import {
  SalaryCorrectFormSchema,
  buildCorrectSalaryRevision,
  defaultCorrectSalaryValues,
  type SalaryCorrectFormValues,
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
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function SalaryCorrectDialog({
  employeeId,
  revision,
  open,
  onOpenChange,
}: {
  employeeId: string;
  revision: SalaryRevisionDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<SalaryCorrectFormValues>({
    resolver: zodResolver(SalaryCorrectFormSchema),
    defaultValues: revision
      ? defaultCorrectSalaryValues(revision)
      : defaultCorrectSalaryValues({ amountMinor: "0", currencyCode: "INR", effectiveOn: "" }),
  });

  const revisionRef = useRef(revision);
  revisionRef.current = revision;

  useEffect(() => {
    if (!open || !revisionRef.current) return;
    form.reset(defaultCorrectSalaryValues(revisionRef.current));
    setFormError(null);
  }, [form, open]);

  async function onSubmit(values: SalaryCorrectFormValues): Promise<void> {
    if (!revision) return;
    const built = buildCorrectSalaryRevision(values, revision.version);
    if (!built.payload) {
      if (built.errors.reason) form.setError("reason", { message: built.errors.reason });
      return;
    }
    setSubmitting(true);
    setFormError(null);
    const result = await applySalaryMutation({
      mutate: () => correctSalaryRevision(employeeId, revision.id, built.payload!),
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
          <DialogTitle>Correct salary revision</DialogTitle>
          <DialogDescription>
            Updates this effective date in place. The date stays {revision?.effectiveOn ?? "—"}. Send
            the current version ({revision?.version ?? "—"}) so a concurrent edit returns 409 instead
            of overwriting.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit((values) => void onSubmit(values))} noValidate>
            <div className="space-y-2">
              <Label>Effective date (UTC)</Label>
              <Input value={revision?.effectiveOn ?? ""} readOnly disabled />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Annual salary</FormLabel>
                    <FormControl>
                      <Input {...field} inputMode="decimal" />
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
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <FormControl>
                    <Textarea {...field} maxLength={500} required />
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
              <Button type="submit" disabled={submitting || !revision}>
                {submitting ? "Saving…" : "Save correction"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
