import type { Request, Response } from "express";
import { EmployeeFilterQuerySchema, ErrorCode } from "@payscope/shared";
import type { AppConfig } from "../config.js";
import { AppError } from "../errors/app-error.js";
import { sendSuccess } from "../utils/api-response.js";
import { importEmployeeCsv, writeEmployeeExport } from "./csv.service.js";
import { readMultipartCsvFile } from "./multipart.js";

function actorId(req: Request): string {
  if (!req.authUser) {
    throw new AppError(401, ErrorCode.UNAUTHENTICATED, "Authentication required");
  }
  return req.authUser.id;
}

export function createCsvController(config: AppConfig) {
  return {
    async exportEmployees(req: Request, res: Response): Promise<void> {
      const query = EmployeeFilterQuerySchema.parse(req.query);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="payscope-employees.csv"');
      await writeEmployeeExport(query, (chunk) => {
        res.write(chunk);
      });
      res.end();
    },

    async importEmployees(req: Request, res: Response): Promise<void> {
      const text = await readMultipartCsvFile(req, config.csvMaxBytes);
      const imported = await importEmployeeCsv(text, actorId(req), config.csvMaxRows);
      sendSuccess(res, 200, "CSV imported", imported);
    },
  };
}
