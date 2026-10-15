import type { Request, Response } from "express";
import {
  CorrectSalaryRevisionSchema,
  CreateSalaryRevisionSchema,
  EmployeeListQuerySchema,
  ErrorCode,
  PaginationQuerySchema,
} from "@payscope/shared";
import { AppError } from "../errors/app-error.js";
import { sendSuccess } from "../utils/api-response.js";
import {
  deactivateEmployee,
  getEmployee,
  listCountries,
  listDepartments,
  listEmployees,
} from "./employees.service.js";
import {
  correctSalaryRevision,
  createSalaryRevision,
  listEmployeeAuditLogs,
  listSalaryRevisions,
} from "../salaries/salaries.service.js";

function actorId(req: Request): string {
  if (!req.authUser) {
    throw new AppError(401, ErrorCode.UNAUTHENTICATED, "Authentication required");
  }
  return req.authUser.id;
}

export async function getDepartments(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, "OK", await listDepartments());
}

export async function getCountries(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, "OK", await listCountries());
}

export async function getEmployees(req: Request, res: Response): Promise<void> {
  const query = EmployeeListQuerySchema.parse(req.query);
  sendSuccess(res, 200, "OK", await listEmployees(query));
}

export async function getEmployeeById(req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, "OK", await getEmployee(req.params.id as string));
}

export async function patchDeactivate(req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, "Employee deactivated", await deactivateEmployee(req.params.id as string));
}

export async function getSalaryRevisions(req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, "OK", await listSalaryRevisions(req.params.id as string));
}

export async function postSalaryRevision(req: Request, res: Response): Promise<void> {
  const body = CreateSalaryRevisionSchema.parse(req.body);
  const revision = await createSalaryRevision(req.params.id as string, actorId(req), body);
  sendSuccess(res, 201, "Salary revision created", revision);
}

export async function patchSalaryRevision(req: Request, res: Response): Promise<void> {
  const body = CorrectSalaryRevisionSchema.parse(req.body);
  const revision = await correctSalaryRevision(
    req.params.id as string,
    req.params.revisionId as string,
    actorId(req),
    body,
  );
  sendSuccess(res, 200, "Salary revision updated", revision);
}

export async function getEmployeeAuditLogs(req: Request, res: Response): Promise<void> {
  const query = PaginationQuerySchema.parse(req.query);
  sendSuccess(
    res,
    200,
    "OK",
    await listEmployeeAuditLogs(req.params.id as string, query.page, query.pageSize),
  );
}
