import { isConflictError, mutationErrorMessage } from "@/lib/api-errors";

export type MutationResult =
  | { ok: true }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled?: false; conflict: boolean; message: string };

export async function applyWriteMutation(options: {
  mutate: () => Promise<unknown>;
  refresh: () => Promise<void>;
}): Promise<MutationResult> {
  try {
    await options.mutate();
    await options.refresh();
    return { ok: true };
  } catch (err) {
    const conflict = isConflictError(err);
    if (conflict) {
      await options.refresh();
    }
    return { ok: false, conflict, message: mutationErrorMessage(err) };
  }
}

export async function applySalaryMutation(options: {
  mutate: () => Promise<unknown>;
  refresh: () => Promise<void>;
}): Promise<MutationResult> {
  return applyWriteMutation(options);
}

export async function applyDeactivation(options: {
  confirmed: boolean;
  mutate: () => Promise<unknown>;
  refresh: () => Promise<void>;
}): Promise<MutationResult> {
  if (!options.confirmed) {
    return { ok: false, cancelled: true };
  }
  try {
    await options.mutate();
    await options.refresh();
    return { ok: true };
  } catch (err) {
    return { ok: false, conflict: false, message: mutationErrorMessage(err) };
  }
}
