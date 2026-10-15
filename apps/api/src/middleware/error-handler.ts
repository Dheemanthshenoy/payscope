import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { ErrorCode } from "@payscope/shared";
import { AppError } from "../errors/app-error.js";
import { sendError } from "../utils/api-response.js";

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    sendError(res, err.status, err.code, err.message);
    return;
  }

  if (err instanceof ZodError) {
    sendError(res, 400, ErrorCode.VALIDATION, "Invalid request");
    return;
  }

  if (err instanceof SyntaxError) {
    sendError(res, 400, ErrorCode.VALIDATION, "Invalid request body");
    return;
  }

  if (process.env.NODE_ENV !== "test") {
    console.error("Unhandled error");
  }

  sendError(res, 500, ErrorCode.INTERNAL, "Something went wrong");
};
