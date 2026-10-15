import { Router } from "express";
import type { AppConfig } from "../config.js";
import { getCountries, getDepartments } from "../employees/employees.controller.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { createRequireAuth } from "../middleware/require-auth.js";

export function createLookupRouter(config: AppConfig): Router {
  const router = Router();
  router.use(createRequireAuth(config));
  router.get("/departments", asyncHandler(getDepartments));
  router.get("/countries", asyncHandler(getCountries));
  return router;
}
