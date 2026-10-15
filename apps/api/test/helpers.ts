import type { Express } from "express";
import request from "supertest";
import type { AppConfig } from "../src/config.js";
import { loadConfig } from "../src/config.js";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { hashPassword } from "../src/auth/password.js";
import { hashSessionToken } from "../src/auth/session.service.js";

export const APP_ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:3000";

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return { ...loadConfig(), ...overrides };
}

export function testApp(overrides: Partial<AppConfig> = {}): Express {
  return createApp(testConfig(overrides));
}

export async function createHrUser(email: string, password: string) {
  return prisma.hRUser.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      role: "HR",
    },
  });
}

export async function deleteHrUserByEmail(email: string): Promise<void> {
  await prisma.hRUser.deleteMany({ where: { email } });
}

export function cookieHeader(res: request.Response, name: string): string | undefined {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.find((entry) => entry.startsWith(`${name}=`));
}

export function cookieValue(setCookie: string | undefined, name: string): string | undefined {
  if (!setCookie) return undefined;
  const part = setCookie.split(";")[0];
  if (!part?.startsWith(`${name}=`)) return undefined;
  return part.slice(name.length + 1);
}

export function login(
  app: Express,
  email: string,
  password: string,
  origin = APP_ORIGIN,
) {
  return request(app).post("/api/auth/login").set("Origin", origin).send({ email, password });
}

export { hashSessionToken };
