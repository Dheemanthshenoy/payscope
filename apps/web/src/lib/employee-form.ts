import {
  CreateEmployeeSchema,
  UpdateEmployeeSchema,
  type CreateEmployee,
  type UpdateEmployee,
} from "@payscope/shared";
import { z } from "zod";

export const CreateEmployeeFormSchema = CreateEmployeeSchema.omit({ isActive: true });
export type CreateEmployeeFormValues = z.input<typeof CreateEmployeeFormSchema>;

export const UpdateEmployeeFormSchema = UpdateEmployeeSchema;
export type UpdateEmployeeFormValues = z.input<typeof UpdateEmployeeFormSchema>;

export function defaultCreateEmployeeValues(): CreateEmployeeFormValues {
  return {
    employeeNumber: "",
    fullName: "",
    departmentId: "",
    countryId: "",
  };
}

export function defaultUpdateEmployeeValues(employee: {
  fullName: string;
  department: { id: string };
  country: { id: string };
}): UpdateEmployeeFormValues {
  return {
    fullName: employee.fullName,
    departmentId: employee.department.id,
    countryId: employee.country.id,
  };
}

export function buildCreateEmployee(values: CreateEmployeeFormValues): {
  payload?: CreateEmployee;
  errors: Partial<Record<keyof CreateEmployeeFormValues, string>>;
} {
  const parsed = CreateEmployeeFormSchema.safeParse(values);
  if (!parsed.success) {
    return { errors: flattenFieldErrors(parsed.error) };
  }
  return { payload: { ...parsed.data, isActive: true }, errors: {} };
}

export function buildUpdateEmployee(values: UpdateEmployeeFormValues): {
  payload?: UpdateEmployee;
  errors: Partial<Record<keyof UpdateEmployeeFormValues, string>>;
} {
  const parsed = UpdateEmployeeFormSchema.safeParse(values);
  if (!parsed.success) {
    return { errors: flattenFieldErrors(parsed.error) };
  }
  return { payload: parsed.data, errors: {} };
}

function flattenFieldErrors<T extends string>(
  error: z.ZodError,
): Partial<Record<T, string>> {
  const errors: Partial<Record<T, string>> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && errors[key as T] === undefined) {
      errors[key as T] = issue.message;
      continue;
    }
    const extraKeys = "keys" in issue && Array.isArray(issue.keys) ? issue.keys : [];
    for (const extra of extraKeys) {
      if (typeof extra === "string" && errors[extra as T] === undefined) {
        errors[extra as T] = issue.message;
      }
    }
  }
  return errors;
}
