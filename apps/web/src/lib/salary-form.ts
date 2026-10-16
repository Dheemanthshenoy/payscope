import {
  CorrectSalaryRevisionSchema,
  CreateSalaryRevisionSchema,
  CurrencyCodeSchema,
  EffectiveOnSchema,
  MajorAmountSchema,
  formatAmountMinor,
  formatEffectiveOn,
  formatMinorAsMajor,
  parseMajorToMinor,
  utcToday,
  type CorrectSalaryRevision,
  type CreateSalaryRevision,
  type CurrencyCode,
} from "@payscope/shared";
import { z } from "zod";

export const SalaryCreateFormSchema = z.object({
  amount: MajorAmountSchema,
  currencyCode: CurrencyCodeSchema,
  effectiveOn: EffectiveOnSchema,
  reason: z.string().max(500),
});

export const SalaryCorrectFormSchema = z.object({
  amount: MajorAmountSchema,
  currencyCode: CurrencyCodeSchema,
  effectiveOn: EffectiveOnSchema,
  reason: z
    .string()
    .trim()
    .min(1, "A reason is required for a same-date correction.")
    .max(500, "Reason must be 500 characters or fewer."),
});

export type SalaryFormValues = {
  amount: string;
  currencyCode: string;
  effectiveOn: string;
  reason: string;
};

export type SalaryCreateFormValues = z.infer<typeof SalaryCreateFormSchema>;
export type SalaryCorrectFormValues = z.infer<typeof SalaryCorrectFormSchema>;

export type SalaryFormErrors = {
  amount?: string;
  currencyCode?: string;
  effectiveOn?: string;
  reason?: string;
};

export function defaultCreateSalaryValues(currencyCode?: string): SalaryCreateFormValues {
  return {
    amount: "",
    currencyCode: CurrencyCodeSchema.parse(currencyCode ?? "INR"),
    effectiveOn: formatEffectiveOn(utcToday()),
    reason: "",
  };
}

export function defaultCorrectSalaryValues(revision: {
  amountMinor: string;
  currencyCode: CurrencyCode;
  effectiveOn: string;
}): SalaryCorrectFormValues {
  return {
    amount: formatAmountMinorAsMajorInput(revision.amountMinor),
    currencyCode: revision.currencyCode,
    effectiveOn: revision.effectiveOn,
    reason: "",
  };
}

export function formatAmountMinorAsMajorInput(amountMinor: string): string {
  return formatMinorAsMajor(BigInt(amountMinor));
}

export function isFutureEffectiveOn(effectiveOn: string): boolean {
  return effectiveOn > formatEffectiveOn(utcToday());
}

function fieldErrors(values: SalaryFormValues, requireReason: boolean): SalaryFormErrors {
  const errors: SalaryFormErrors = {};
  if (!MajorAmountSchema.safeParse(values.amount).success) {
    errors.amount = "Enter an annual salary with at most two decimal places.";
  }
  if (!CurrencyCodeSchema.safeParse(values.currencyCode).success) {
    errors.currencyCode = "Choose INR, USD, GBP, AED, or EUR.";
  }
  if (!EffectiveOnSchema.safeParse(values.effectiveOn).success) {
    errors.effectiveOn = "Enter a valid UTC date (YYYY-MM-DD).";
  }
  const reason = values.reason.trim();
  if (requireReason && reason.length === 0) {
    errors.reason = "A reason is required for a same-date correction.";
  }
  if (reason.length > 500) {
    errors.reason = "Reason must be 500 characters or fewer.";
  }
  return errors;
}

export function buildCreateSalaryRevision(values: SalaryFormValues): {
  payload?: CreateSalaryRevision;
  errors: SalaryFormErrors;
} {
  const errors = fieldErrors(values, false);
  if (Object.keys(errors).length > 0) {
    return { errors };
  }
  const amountMinor = formatAmountMinor(parseMajorToMinor(values.amount.trim()));
  const reason = values.reason.trim();
  const payload = CreateSalaryRevisionSchema.parse({
    amountMinor,
    currencyCode: values.currencyCode,
    effectiveOn: values.effectiveOn,
    reason: reason.length > 0 ? reason : undefined,
  });
  return { payload, errors: {} };
}

export function buildCorrectSalaryRevision(
  values: SalaryFormValues,
  expectedVersion: number,
): {
  payload?: CorrectSalaryRevision;
  errors: SalaryFormErrors;
} {
  const errors = fieldErrors(values, true);
  if (Object.keys(errors).length > 0) {
    return { errors };
  }
  const amountMinor = formatAmountMinor(parseMajorToMinor(values.amount.trim()));
  const payload = CorrectSalaryRevisionSchema.parse({
    amountMinor,
    currencyCode: values.currencyCode,
    reason: values.reason.trim(),
    expectedVersion,
  });
  return { payload, errors: {} };
}
