import { ErrorCode, type AuthUser } from "@payscope/shared";
import type { AppConfig } from "../config.js";
import { prisma } from "../db/prisma.js";
import { AppError } from "../errors/app-error.js";
import { verifyPassword } from "./password.js";
import {
  createSession,
  deleteSessionById,
  deleteSessionByToken,
  type SessionRecord,
} from "./session.service.js";

const INVALID_CREDENTIALS = "Invalid email or password";

function toAuthUser(user: { id: string; email: string; role: string }): AuthUser {
  if (user.role !== "HR") {
    throw new AppError(401, ErrorCode.UNAUTHENTICATED, "Authentication required");
  }
  return { id: user.id, email: user.email, role: "HR" };
}

export async function authenticate(
  config: AppConfig,
  email: string,
  password: string,
  existingToken: string | undefined,
): Promise<{ user: AuthUser; session: SessionRecord }> {
  const user = await prisma.hRUser.findUnique({
    where: { email },
  });

  const passwordOk = await verifyPassword(user?.passwordHash, password);
  if (!user || !passwordOk) {
    throw new AppError(401, ErrorCode.INVALID_CREDENTIALS, INVALID_CREDENTIALS);
  }

  if (existingToken) {
    await deleteSessionByToken(config, existingToken);
  }

  const session = await createSession(config, user.id);
  return { user: toAuthUser(user), session };
}

export async function getAuthenticatedUser(userId: string): Promise<AuthUser> {
  const user = await prisma.hRUser.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true },
  });
  if (!user) {
    throw new AppError(401, ErrorCode.UNAUTHENTICATED, "Authentication required");
  }
  return toAuthUser(user);
}

export async function logout(
  config: AppConfig,
  token: string | undefined,
  sessionId: string | undefined,
): Promise<void> {
  if (sessionId) {
    await deleteSessionById(sessionId);
    return;
  }
  if (token) {
    await deleteSessionByToken(config, token);
  }
}
