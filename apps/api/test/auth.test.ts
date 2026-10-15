import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { ErrorCode } from "@payscope/shared";
import { prisma } from "../src/db/prisma.js";
import {
  APP_ORIGIN,
  cookieHeader,
  cookieValue,
  createHrUser,
  deleteHrUserByEmail,
  hashSessionToken,
  login,
  testApp,
  testConfig,
} from "./helpers.js";

const password = "correct-horse-battery";
let emails: string[] = [];

function uniqueEmail(): string {
  const email = `hr-${randomUUID()}@example.com`;
  emails.push(email);
  return email;
}

afterEach(async () => {
  for (const email of emails) {
    await deleteHrUserByEmail(email);
  }
  emails = [];
});

describe("GET /api/health", () => {
  it("is public and uses the success envelope", async () => {
    const res = await request(testApp()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "OK",
      data: { status: "ok" },
    });
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with valid credentials and sets an HttpOnly session cookie", async () => {
    const email = uniqueEmail();
    const user = await createHrUser(email, password);
    const config = testConfig();
    const res = await login(testApp(config), email, password);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ id: user.id, email, role: "HR" });
    expect(res.body.data).not.toHaveProperty("passwordHash");

    const header = cookieHeader(res, config.cookieName);
    expect(header).toBeDefined();
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=Lax/i);
    expect(header).toMatch(/Path=\//i);
    expect(header).not.toMatch(/Secure/i);
    expect(cookieValue(header, config.cookieName)?.length).toBeGreaterThan(20);
  });

  it("returns the same generic error for unknown email and wrong password", async () => {
    const email = uniqueEmail();
    await createHrUser(email, password);
    const app = testApp();

    const unknown = await login(app, `missing-${randomUUID()}@example.com`, password);
    const wrong = await login(app, email, "wrong-password");

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
    expect(unknown.body).toEqual({
      success: false,
      error: { code: ErrorCode.INVALID_CREDENTIALS, message: "Invalid email or password" },
    });
  });

  it("rejects missing and invalid payloads", async () => {
    const app = testApp();
    const missing = await request(app).post("/api/auth/login").set("Origin", APP_ORIGIN).send({});
    const invalid = await request(app)
      .post("/api/auth/login")
      .set("Origin", APP_ORIGIN)
      .send({ email: "not-an-email", password: "x" });

    expect(missing.status).toBe(400);
    expect(invalid.status).toBe(400);
    expect(missing.body.error.code).toBe(ErrorCode.VALIDATION);
    expect(invalid.body.error.code).toBe(ErrorCode.VALIDATION);
  });

  it("rejects missing Origin and Host-only requests", async () => {
    const email = uniqueEmail();
    await createHrUser(email, password);
    const app = testApp();

    const missing = await request(app).post("/api/auth/login").send({ email, password });
    const hostOnly = await request(app)
      .post("/api/auth/login")
      .set("Host", "localhost:3000")
      .send({ email, password });
    const invalid = await request(app)
      .post("/api/auth/login")
      .set("Origin", "https://evil.example")
      .send({ email, password });

    expect(missing.status).toBe(403);
    expect(hostOnly.status).toBe(403);
    expect(invalid.status).toBe(403);
    expect(missing.body.error.code).toBe(ErrorCode.CSRF);
    expect(hostOnly.body.error.code).toBe(ErrorCode.CSRF);
    expect(invalid.body.error.code).toBe(ErrorCode.CSRF);
  });

  it("sets Secure on the session cookie when configured for production", async () => {
    const email = uniqueEmail();
    await createHrUser(email, password);
    const config = testConfig({ cookieSecure: true, nodeEnv: "production" });
    const res = await login(testApp(config), email, password);
    const header = cookieHeader(res, config.cookieName);
    expect(res.status).toBe(200);
    expect(header).toMatch(/Secure/i);
  });

  it("issues a new session token on login (session fixation)", async () => {
    const email = uniqueEmail();
    const user = await createHrUser(email, password);
    const config = testConfig();
    const attackerToken = "attacker-chosen-token";
    await prisma.session.create({
      data: {
        tokenHash: hashSessionToken(attackerToken, config.sessionSecret),
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
        lastSeenAt: new Date(),
      },
    });

    const res = await request(testApp(config))
      .post("/api/auth/login")
      .set("Origin", APP_ORIGIN)
      .set("Cookie", `${config.cookieName}=${attackerToken}`)
      .send({ email, password });

    expect(res.status).toBe(200);
    const issued = cookieValue(cookieHeader(res, config.cookieName), config.cookieName);
    expect(issued).toBeDefined();
    expect(issued).not.toBe(attackerToken);

    const old = await prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(attackerToken, config.sessionSecret) },
    });
    expect(old).toBeNull();

    const meOld = await request(testApp(config))
      .get("/api/auth/me")
      .set("Cookie", `${config.cookieName}=${attackerToken}`);
    expect(meOld.status).toBe(401);

    const meNew = await request(testApp(config))
      .get("/api/auth/me")
      .set("Cookie", `${config.cookieName}=${issued}`);
    expect(meNew.status).toBe(200);
    expect(meNew.body.data.email).toBe(email);
  });

  it("rate limits repeated login attempts", async () => {
    const email = uniqueEmail();
    await createHrUser(email, password);
    const app = testApp({ loginRateLimitMax: 3, loginRateLimitWindowMs: 60_000 });

    for (let i = 0; i < 3; i += 1) {
      const res = await login(app, email, "wrong-password");
      expect(res.status).toBe(401);
    }
    const limited = await login(app, email, password);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe(ErrorCode.RATE_LIMITED);
  });
});

describe("GET /api/auth/me", () => {
  it("returns the current HR user when authenticated", async () => {
    const email = uniqueEmail();
    const user = await createHrUser(email, password);
    const config = testConfig();
    const app = testApp(config);
    const loggedIn = await login(app, email, password);
    const token = cookieValue(cookieHeader(loggedIn, config.cookieName), config.cookieName);

    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", `${config.cookieName}=${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: user.id, email, role: "HR" });
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(testApp()).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHENTICATED);
  });

  it("returns 401 for an expired session", async () => {
    const email = uniqueEmail();
    const user = await createHrUser(email, password);
    const config = testConfig();
    const token = "expired-session-token";
    await prisma.session.create({
      data: {
        tokenHash: hashSessionToken(token, config.sessionSecret),
        userId: user.id,
        expiresAt: new Date(Date.now() - 1000),
        lastSeenAt: new Date(Date.now() - 60_000),
      },
    });

    const res = await request(testApp(config))
      .get("/api/auth/me")
      .set("Cookie", `${config.cookieName}=${token}`);
    expect(res.status).toBe(401);
  });

  it("refreshes idle expiry on authenticated activity", async () => {
    const email = uniqueEmail();
    const user = await createHrUser(email, password);
    const config = testConfig();
    const token = "sliding-session-token";
    const originalExpiry = new Date(Date.now() + 30 * 60 * 1000);
    const session = await prisma.session.create({
      data: {
        tokenHash: hashSessionToken(token, config.sessionSecret),
        userId: user.id,
        expiresAt: originalExpiry,
        lastSeenAt: new Date(Date.now() - 60_000),
      },
    });

    const res = await request(testApp(config))
      .get("/api/auth/me")
      .set("Cookie", `${config.cookieName}=${token}`);
    expect(res.status).toBe(200);

    const updated = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(updated.expiresAt.getTime()).toBeGreaterThan(originalExpiry.getTime());
    expect(updated.lastSeenAt.getTime()).toBeGreaterThan(session.lastSeenAt.getTime());
  });
});

describe("POST /api/auth/logout", () => {
  it("invalidates the session server-side", async () => {
    const email = uniqueEmail();
    await createHrUser(email, password);
    const config = testConfig();
    const app = testApp(config);
    const loggedIn = await login(app, email, password);
    const token = cookieValue(cookieHeader(loggedIn, config.cookieName), config.cookieName);

    const logoutRes = await request(app)
      .post("/api/auth/logout")
      .set("Origin", APP_ORIGIN)
      .set("Cookie", `${config.cookieName}=${token}`);
    expect(logoutRes.status).toBe(204);
    expect(logoutRes.text).toBe("");

    const me = await request(app)
      .get("/api/auth/me")
      .set("Cookie", `${config.cookieName}=${token}`);
    expect(me.status).toBe(401);

    const stored = await prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token ?? "", config.sessionSecret) },
    });
    expect(stored).toBeNull();
  });
});
