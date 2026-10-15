import type { CookieOptions, Response } from "express";
import type { AppConfig } from "../config.js";

export function sessionCookieOptions(config: AppConfig, maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: config.cookieSecure,
    maxAge: maxAgeMs,
  };
}

export function setSessionCookie(res: Response, config: AppConfig, token: string): void {
  res.cookie(config.cookieName, token, sessionCookieOptions(config, config.sessionIdleMs));
}

export function clearSessionCookie(res: Response, config: AppConfig): void {
  res.clearCookie(config.cookieName, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: config.cookieSecure,
  });
}

export function readSessionToken(
  cookies: Record<string, unknown> | undefined,
  config: AppConfig,
): string | undefined {
  const value = cookies?.[config.cookieName];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
