export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  databaseUrl: string;
  appOrigin: string;
  sessionSecret: string;
  sessionIdleMs: number;
  cookieName: string;
  cookieSecure: boolean;
  trustProxyHops: number | false;
  loginRateLimitMax: number;
  loginRateLimitWindowMs: number;
  port: number;
};

/** Sliding idle timeout: 8 hours from last authenticated activity. */
export const SESSION_IDLE_MS = 8 * 60 * 60 * 1000;

function parseOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("APP_ORIGIN must be an absolute origin (e.g. http://localhost:3000)");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("APP_ORIGIN must be scheme://host[:port] with no path, query, or credentials");
  }
  return url.origin;
}

function parseNodeEnv(value: string | undefined): AppConfig["nodeEnv"] {
  if (value === "production" || value === "test" || value === "development") {
    return value;
  }
  return "development";
}

function parseHops(value: string | undefined): number | false {
  if (value === undefined || value.trim() === "") {
    return false;
  }
  const hops = Number(value);
  if (!Number.isInteger(hops) || hops < 1) {
    throw new Error("TRUST_PROXY_HOPS must be a positive integer when set");
  }
  return hops;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = parseNodeEnv(env.NODE_ENV);

  const secret = env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error("Missing required environment variable SESSION_SECRET");
  }
  if (nodeEnv === "production" && secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters in production");
  }
  if (secret.length < 16) {
    throw new Error("SESSION_SECRET must be at least 16 characters");
  }

  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("Missing required environment variable DATABASE_URL");
  }

  const appOriginRaw = env.APP_ORIGIN?.trim();
  if (!appOriginRaw) {
    throw new Error("Missing required environment variable APP_ORIGIN");
  }

  const loginRateLimitMax = Number(env.AUTH_LOGIN_RATE_LIMIT_MAX ?? 10);
  const loginRateLimitWindowMs = Number(env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000);
  if (!Number.isInteger(loginRateLimitMax) || loginRateLimitMax < 1) {
    throw new Error("AUTH_LOGIN_RATE_LIMIT_MAX must be a positive integer");
  }
  if (!Number.isFinite(loginRateLimitWindowMs) || loginRateLimitWindowMs < 1) {
    throw new Error("AUTH_LOGIN_RATE_LIMIT_WINDOW_MS must be a positive number");
  }

  const port = Number(env.API_PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1) {
    throw new Error("API_PORT must be a positive integer");
  }

  return {
    nodeEnv,
    databaseUrl,
    appOrigin: parseOrigin(appOriginRaw),
    sessionSecret: secret,
    sessionIdleMs: SESSION_IDLE_MS,
    cookieName: "payscope_session",
    cookieSecure: nodeEnv === "production",
    trustProxyHops: parseHops(env.TRUST_PROXY_HOPS),
    loginRateLimitMax,
    loginRateLimitWindowMs,
    port,
  };
}
