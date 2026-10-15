import type { RequestHandler } from "express";
import { ErrorCode } from "@payscope/shared";
import { getAuthenticatedUser } from "../auth/auth.service.js";
import { readSessionToken, setSessionCookie } from "../auth/cookie.js";
import { findValidSession, touchSession } from "../auth/session.service.js";
import type { AppConfig } from "../config.js";
import { AppError } from "../errors/app-error.js";

export function createRequireAuth(config: AppConfig): RequestHandler {
  return async (req, res, next) => {
    try {
      const token = readSessionToken(req.cookies, config);
      if (!token) {
        throw new AppError(401, ErrorCode.UNAUTHENTICATED, "Authentication required");
      }

      const session = await findValidSession(config, token);
      if (!session) {
        throw new AppError(401, ErrorCode.UNAUTHENTICATED, "Authentication required");
      }

      const user = await getAuthenticatedUser(session.userId);
      await touchSession(config, session.id);
      setSessionCookie(res, config, token);

      req.authUser = user;
      req.sessionId = session.id;
      next();
    } catch (err) {
      next(err);
    }
  };
}
