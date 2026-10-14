import express from "express";
import { HealthResponseSchema } from "@payscope/shared";

export const app = express();

app.get("/api/health", (_req, res) => {
  const body = HealthResponseSchema.parse({ status: "ok" });
  res.json(body);
});
