import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { createAuthRouter } from "./auth/auth.routes.js";
import type { AppConfig } from "./config.js";
import { createAnalyticsRouter } from "./analytics/analytics.routes.js";
import { createEmployeeRouter } from "./employees/employees.routes.js";
import { health } from "./health/health.controller.js";
import { createLookupRouter } from "./lookups/lookups.routes.js";
import { createCsrfMiddleware } from "./middleware/csrf.js";
import { errorHandler } from "./middleware/error-handler.js";

export function createApp(config: AppConfig): express.Express {
  const app = express();

  if (config.trustProxyHops !== false) {
    app.set("trust proxy", config.trustProxyHops);
  }

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser());
  app.use(createCsrfMiddleware(config));

  app.get("/api/health", health);
  app.use("/api/auth", createAuthRouter(config));
  app.use("/api", createLookupRouter(config));
  app.use("/api/analytics", createAnalyticsRouter(config));
  app.use("/api/employees", createEmployeeRouter(config));

  app.use(errorHandler);
  return app;
}
