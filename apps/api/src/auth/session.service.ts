/**
 * Server-side sessions: the cookie holds an opaque token; PostgreSQL stores only
 * HMAC-SHA256(token, SESSION_SECRET). Idle timeout is 8 hours from last
 * authenticated activity (sliding). Login always issues a new token (fixation).
 */
import { createHmac, randomBytes } from "node:crypto";
import type { AppConfig } from "../config.js";
import { prisma } from "../db/prisma.js";

export type SessionRecord = {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
};

export function hashSessionToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(
  config: AppConfig,
  userId: string,
): Promise<SessionRecord> {
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token, config.sessionSecret);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.sessionIdleMs);
  const session = await prisma.session.create({
    data: {
      tokenHash,
      userId,
      expiresAt,
      lastSeenAt: now,
    },
  });
  return { id: session.id, userId, token, expiresAt };
}

export async function findValidSession(
  config: AppConfig,
  token: string,
): Promise<{ id: string; userId: string; expiresAt: Date } | undefined> {
  const tokenHash = hashSessionToken(token, config.sessionSecret);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
  });
  if (!session || session.expiresAt.getTime() <= Date.now()) {
    return undefined;
  }
  return { id: session.id, userId: session.userId, expiresAt: session.expiresAt };
}

export async function touchSession(
  config: AppConfig,
  sessionId: string,
): Promise<Date> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.sessionIdleMs);
  await prisma.session.update({
    where: { id: sessionId },
    data: { lastSeenAt: now, expiresAt },
  });
  return expiresAt;
}

export async function deleteSessionByToken(
  config: AppConfig,
  token: string,
): Promise<void> {
  const tokenHash = hashSessionToken(token, config.sessionSecret);
  await prisma.session.deleteMany({ where: { tokenHash } });
}

export async function deleteSessionById(sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}
