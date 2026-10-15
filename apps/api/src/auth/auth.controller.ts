import type { Request, Response } from "express";
import { ErrorCode, type LoginRequest } from "@payscope/shared";
import { authenticate, logout } from "./auth.service.js";
import { AppError } from "../errors/app-error.js";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "./cookie.js";
import type { AppConfig } from "../config.js";
import { sendSuccess } from "../utils/api-response.js";

export function createAuthController(config: AppConfig) {
  return {
    async login(req: Request, res: Response): Promise<void> {
      const body = req.body as LoginRequest;
      const existingToken = readSessionToken(req.cookies, config);
      const { user, session } = await authenticate(
        config,
        body.email,
        body.password,
        existingToken,
      );
      setSessionCookie(res, config, session.token);
      sendSuccess(res, 200, "Logged in", user);
    },

    async me(req: Request, res: Response): Promise<void> {
      if (!req.authUser) {
        throw new AppError(401, ErrorCode.UNAUTHENTICATED, "Authentication required");
      }
      sendSuccess(res, 200, "OK", req.authUser);
    },

    async logout(req: Request, res: Response): Promise<void> {
      const token = readSessionToken(req.cookies, config);
      await logout(config, token, req.sessionId);
      clearSessionCookie(res, config);
      sendSuccess(res, 204, "");
    },
  };
}
