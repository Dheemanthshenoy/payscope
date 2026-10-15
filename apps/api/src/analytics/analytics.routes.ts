import { Router } from "express";
import { AnalyticsQuerySchema } from "@payscope/shared";
import type { AppConfig } from "../config.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { createRequireAuth } from "../middleware/require-auth.js";
import { validateQuery } from "../middleware/validate-query.js";
import { getCompensation } from "./analytics.controller.js";

export function createAnalyticsRouter(config: AppConfig): Router {
  const router = Router();
  router.use(createRequireAuth(config));
  router.get(
    "/compensation",
    validateQuery(AnalyticsQuerySchema),
    asyncHandler(getCompensation),
  );
  return router;
}
