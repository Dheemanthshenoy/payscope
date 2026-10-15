import type { Response } from "express";

export type ApiSuccessBody<T> = {
  success: true;
  message: string;
  data: T;
};

export type ApiErrorBody = {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

const BODYLESS_STATUSES = new Set([204, 304]);

export function sendSuccess<T>(
  res: Response,
  status: number,
  message: string,
  data?: T,
): void {
  if (BODYLESS_STATUSES.has(status)) {
    res.status(status).end();
    return;
  }
  const body: ApiSuccessBody<T | Record<string, never>> = {
    success: true,
    message,
    data: (data ?? {}) as T | Record<string, never>,
  };
  res.status(status).json(body);
}

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
): void {
  const body: ApiErrorBody = {
    success: false,
    error: { code, message },
  };
  res.status(status).json(body);
}
