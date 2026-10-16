import { Router } from "express";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import {
  CorrectSalaryRevisionSchema,
  CreateEmployeeSchema,
  CreateSalaryRevisionSchema,
  EmployeeFilterQuerySchema,
  EmployeeListQuerySchema,
  ErrorCode,
  PaginationQuerySchema,
  UpdateEmployeeSchema,
} from "@payscope/shared";
import type { AppConfig } from "../config.js";
import { createCsvController } from "../csv/csv.controller.js";
import { AppError } from "../errors/app-error.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { createRequireAuth } from "../middleware/require-auth.js";
import { validateBody } from "../middleware/validate-body.js";
import { validateParams } from "../middleware/validate-params.js";
import { validateQuery } from "../middleware/validate-query.js";
import {
  getCountries,
  getDepartments,
  getEmployeeAuditLogs,
  getEmployeeById,
  getEmployees,
  getSalaryRevisions,
  patchDeactivate,
  patchEmployee,
  patchSalaryRevision,
  postEmployee,
  postSalaryRevision,
} from "./employees.controller.js";

const EmployeeIdParams = z.object({ id: z.uuid() });
const RevisionParams = z.object({ id: z.uuid(), revisionId: z.uuid() });

export function createEmployeeRouter(config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(config);
  const csv = createCsvController(config);
  const importLimiter = rateLimit({
    windowMs: config.importRateLimitWindowMs,
    limit: config.importRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    handler: (_req, _res, next) => {
      next(new AppError(429, ErrorCode.RATE_LIMITED, "Too many import attempts. Try again later."));
    },
  });

  router.use(requireAuth);

  router.get("/export", validateQuery(EmployeeFilterQuerySchema), asyncHandler(csv.exportEmployees));
  router.post("/import", importLimiter, asyncHandler(csv.importEmployees));
  router.get("/", validateQuery(EmployeeListQuerySchema), asyncHandler(getEmployees));
  router.post("/", validateBody(CreateEmployeeSchema), asyncHandler(postEmployee));
  router.get(
    "/:id/salary-revisions",
    validateParams(EmployeeIdParams),
    asyncHandler(getSalaryRevisions),
  );
  router.post(
    "/:id/salary-revisions",
    validateParams(EmployeeIdParams),
    validateBody(CreateSalaryRevisionSchema),
    asyncHandler(postSalaryRevision),
  );
  router.patch(
    "/:id/salary-revisions/:revisionId",
    validateParams(RevisionParams),
    validateBody(CorrectSalaryRevisionSchema),
    asyncHandler(patchSalaryRevision),
  );
  router.get(
    "/:id/audit-logs",
    validateParams(EmployeeIdParams),
    validateQuery(PaginationQuerySchema),
    asyncHandler(getEmployeeAuditLogs),
  );
  router.patch(
    "/:id/deactivate",
    validateParams(EmployeeIdParams),
    asyncHandler(patchDeactivate),
  );
  router.patch(
    "/:id",
    validateParams(EmployeeIdParams),
    validateBody(UpdateEmployeeSchema),
    asyncHandler(patchEmployee),
  );
  router.get("/:id", validateParams(EmployeeIdParams), asyncHandler(getEmployeeById));

  return router;
}
