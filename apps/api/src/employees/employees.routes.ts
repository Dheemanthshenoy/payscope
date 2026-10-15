import { Router } from "express";
import { z } from "zod";
import {
  CorrectSalaryRevisionSchema,
  CreateSalaryRevisionSchema,
  EmployeeListQuerySchema,
  PaginationQuerySchema,
} from "@payscope/shared";
import type { AppConfig } from "../config.js";
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
  patchSalaryRevision,
  postSalaryRevision,
} from "./employees.controller.js";

const EmployeeIdParams = z.object({ id: z.uuid() });
const RevisionParams = z.object({ id: z.uuid(), revisionId: z.uuid() });

export function createEmployeeRouter(config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(config);

  router.use(requireAuth);

  router.get("/", validateQuery(EmployeeListQuerySchema), asyncHandler(getEmployees));
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
  router.get("/:id", validateParams(EmployeeIdParams), asyncHandler(getEmployeeById));

  return router;
}
