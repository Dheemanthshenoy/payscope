import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { ErrorCode } from "@payscope/shared";
import { AppError } from "../errors/app-error.js";

export function validateBody(schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(new AppError(400, ErrorCode.VALIDATION, "Invalid request body"));
      return;
    }
    req.body = result.data;
    next();
  };
}
