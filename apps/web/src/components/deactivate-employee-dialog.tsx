"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { deactivateEmployee } from "@/lib/api";
import { invalidateEmployeeScope } from "@/lib/query-client";
import { applyDeactivation } from "@/lib/salary-actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function DeactivateEmployeeDialog({
  employeeId,
  employeeName,
  open,
  onOpenChange,
}: {
  employeeId: string;
  employeeName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onConfirm(): Promise<void> {
    setSubmitting(true);
    setFormError(null);
    const result = await applyDeactivation({
      confirmed: true,
      mutate: () => deactivateEmployee(employeeId),
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
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setFormError(null);
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Deactivate {employeeName}?</AlertDialogTitle>
          <AlertDialogDescription>
            They stay in the directory as inactive and remain searchable. PayScope does not
            reactivate employees from this screen.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {formError ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {formError}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel type="button" disabled={submitting} onClick={() => onOpenChange(false)}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction type="button" disabled={submitting} onClick={() => void onConfirm()}>
            {submitting ? "Deactivating…" : "Deactivate"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
