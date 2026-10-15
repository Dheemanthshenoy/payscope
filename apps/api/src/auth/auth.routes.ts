import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { ErrorCode, LoginRequestSchema } from "@payscope/shared";
import { createAuthController } from "./auth.controller.js";
import type { AppConfig } from "../config.js";
import { AppError } from "../errors/app-error.js";
import { createRequireAuth } from "../middleware/require-auth.js";
import { validateBody } from "../middleware/validate-body.js";

export function createAuthRouter(config: AppConfig): Router {
  const router = Router();
  const controller = createAuthController(config);
  const requireAuth = createRequireAuth(config);

  const loginLimiter = rateLimit({
    windowMs: config.loginRateLimitWindowMs,
    limit: config.loginRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    handler: (_req, _res, next) => {
      next(
        new AppError(
          429,
          ErrorCode.RATE_LIMITED,
          "Too many login attempts. Try again later.",
        ),
      );
    },
  });

  router.post("/login", loginLimiter, validateBody(LoginRequestSchema), (req, res, next) => {
    void controller.login(req, res).catch(next);
  });

  router.post("/logout", (req, res, next) => {
    void controller.logout(req, res).catch(next);
  });

  router.get("/me", requireAuth, (req, res, next) => {
    void controller.me(req, res).catch(next);
  });

  return router;
}
