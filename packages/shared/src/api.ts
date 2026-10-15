import { z } from "zod";

export const ErrorCode = {
  VALIDATION: "VALIDATION",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  CSRF: "CSRF",
  RATE_LIMITED: "RATE_LIMITED",
  CONFLICT: "CONFLICT",
  NOT_FOUND: "NOT_FOUND",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ApiSuccessSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.unknown(),
});

export const ApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export type ApiSuccess<T> = {
  success: true;
  message: string;
  data: T;
};

export type ApiError = z.infer<typeof ApiErrorSchema>;
