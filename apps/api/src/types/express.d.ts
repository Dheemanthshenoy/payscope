import type { AuthUser } from "@payscope/shared";

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      sessionId?: string;
    }
  }
}

export {};
