import type { Request } from "express";
import { ErrorCode } from "@payscope/shared";
import { AppError } from "../errors/app-error.js";

function csvDetails(message: string) {
  return { rows: [{ rowNumber: 1, field: "file", message }] };
}

export async function readMultipartCsvFile(req: Request, maxBytes: number): Promise<string> {
  const contentType = req.headers["content-type"] ?? "";
  const match = /multipart\/form-data;\s*boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!match) {
    throw new AppError(
      400,
      ErrorCode.CSV_INVALID,
      "CSV import must be multipart/form-data with a file field",
      csvDetails("Expected multipart/form-data file upload"),
    );
  }
  const boundary = (match[1] ?? match[2] ?? "").trim();
  if (!boundary) {
    throw new AppError(400, ErrorCode.CSV_INVALID, "Malformed multipart request", csvDetails("Missing boundary"));
  }

  const body = await readBoundedBody(req, maxBytes);
  const text = body.toString("utf8");
  const delimiter = `--${boundary}`;
  const parts = text.split(delimiter);
  for (const part of parts) {
    if (part === "" || part === "--" || part.startsWith("--")) {
      continue;
    }
    const headerEnd = part.indexOf("\r\n\r\n");
    const altEnd = headerEnd === -1 ? part.indexOf("\n\n") : headerEnd;
    if (altEnd === -1) continue;
    const rawHeaders = part.slice(0, altEnd);
    const disposition = /content-disposition:\s*form-data;\s*name="([^"]+)"/i.exec(rawHeaders);
    if (disposition?.[1] !== "file") continue;
    let content = part.slice(altEnd + (headerEnd === -1 ? 2 : 4));
    if (content.endsWith("\r\n")) content = content.slice(0, -2);
    else if (content.endsWith("\n")) content = content.slice(0, -1);
    return content;
  }

  throw new AppError(
    400,
    ErrorCode.CSV_INVALID,
    "CSV import requires a file field named file",
    csvDetails("Missing file field"),
  );
}

function readBoundedBody(req: Request, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(
          new AppError(
            400,
            ErrorCode.CSV_INVALID,
            "CSV file is too large",
            csvDetails(`File exceeds ${maxBytes} bytes`),
          ),
        );
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", (err) => reject(err));
  });
}
