import type { Request, Response } from "express";
import { AnalyticsQuerySchema } from "@payscope/shared";
import { sendSuccess } from "../utils/api-response.js";
import { getCompensationAnalytics } from "./analytics.service.js";

export async function getCompensation(req: Request, res: Response): Promise<void> {
  const query = AnalyticsQuerySchema.parse(req.query);
  sendSuccess(res, 200, "OK", await getCompensationAnalytics(query));
}
