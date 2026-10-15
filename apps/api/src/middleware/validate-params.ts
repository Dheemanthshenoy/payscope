import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { ErrorCode } from "@payscope/shared";
import { AppError } from "../errors/app-error.js";

export function validateParams(schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(new AppError(400, ErrorCode.VALIDATION, "Invalid path parameters"));
      return;
    }
    req.params = result.data as typeof req.params;
    next();
  };
}
