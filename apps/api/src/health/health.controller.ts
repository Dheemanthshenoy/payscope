import type { Request, Response } from "express";
import { HealthResponseSchema } from "@payscope/shared";
import { sendSuccess } from "../utils/api-response.js";

export function health(_req: Request, res: Response): void {
  const data = HealthResponseSchema.parse({ status: "ok" });
  sendSuccess(res, 200, "OK", data);
}
