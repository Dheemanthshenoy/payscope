import type { RequestHandler } from "express";
import { ErrorCode } from "@payscope/shared";
import type { AppConfig } from "../config.js";
import { AppError } from "../errors/app-error.js";

const UNSAFE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

function originOf(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

export function createCsrfMiddleware(config: AppConfig): RequestHandler {
  return (req, _res, next) => {
    if (!UNSAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    const header = req.headers.origin;
    if (typeof header !== "string" || header.length === 0) {
      next(new AppError(403, ErrorCode.CSRF, "Invalid request origin"));
      return;
    }

    const origin = originOf(header);
    if (!origin || origin !== config.appOrigin) {
      next(new AppError(403, ErrorCode.CSRF, "Invalid request origin"));
      return;
    }

    next();
  };
}
