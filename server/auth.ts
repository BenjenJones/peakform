import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { Hono } from "hono";
import { config, mailEnabled } from "./config.js";
import { sendResetMail } from "./mail.js";
import {
  authenticate,
  createResetToken,
  createSession,
  destroySession,
  register,
  RESET_MINUTES,
  resetPassword,
  sessionUser,
  upsertHaUser,
  type User,
  UserError,
} from "./users.js";

export type AppEnv = { Variables: { user: User } };

const COOKIE = "pf_session";

export function clientIp(c: Context): string {
  if (config.trustProxy) {
    const fwd = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (fwd) return fwd;
  }
  return getConnInfo(c).remote.address?.replace(/^::ffff:/, "") ?? "unknown";
}

const isHttps = (c: Context) =>
  new URL(c.req.url).protocol === "https:" || (config.trustProxy && c.req.header("x-forwarded-proto") === "https");

// ---------- Brute-force throttle: 10 failed attempts per IP per 15 minutes ----------

const WINDOW_MS = 15 * 60_000;
const MAX_FAILS = 10;
const fails = new Map<string, { n: number; resetAt: number }>();

function throttled(ip: string) {
  const f = fails.get(ip);
  if (f && f.resetAt < Date.now()) fails.delete(ip);
  return (fails.get(ip)?.n ?? 0) >= MAX_FAILS;
}
function recordFail(ip: string) {
  const f = fails.get(ip) ?? { n: 0, resetAt: Date.now() + WINDOW_MS };
  f.n++;
  fails.set(ip, f);
}

// ---------- Middleware ----------

/**
 * Resolves the current user.
 * - HA app: the Supervisor ingress proxy has already authenticated the HA user and sends
 *   X-Remote-User-* headers. They are trustworthy because only the proxy can reach us.
 * - Standalone: session cookie.
 */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  let user: User | null = null;
  if (config.isHaApp) {
    const id = c.req.header("x-remote-user-id");
    if (id) user = upsertHaUser(id, c.req.header("x-remote-user-name") ?? "", c.req.header("x-remote-user-display-name") ?? null);
  } else {
    const token = getCookie(c, COOKIE);
    if (token) user = sessionUser(token);
  }
  if (!user) return c.json({ error: "unauthenticated" }, 401);
  c.set("user", user);
  await next();
};

/** CSRF: SameSite=Lax cookies plus a same-origin check on state-changing requests. */
export const sameOrigin: MiddlewareHandler = async (c, next) => {
  if (!config.isHaApp && !["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("origin");
    const host = (config.trustProxy && c.req.header("x-forwarded-host")) || c.req.header("host");
    if (origin && new URL(origin).host !== host) return c.json({ error: "cross-origin request rejected" }, 403);
  }
  await next();
};

// ---------- Routes (public) ----------

export const authRoutes = new Hono();

authRoutes.get("/config", (c) =>
  c.json({
    mode: config.isHaApp ? "homeassistant" : "local",
    registration: !config.isHaApp && config.allowRegistration,
    passwordReset: mailEnabled(),
  }),
);

function startSession(c: Context, user: User) {
  setCookie(c, COOKIE, createSession(user.id), {
    httpOnly: true,
    secure: isHttps(c),
    sameSite: "Lax",
    path: "/",
    maxAge: config.sessionDays * 86_400,
  });
  return c.json({ id: user.id, username: user.username });
}

authRoutes.post("/register", async (c) => {
  if (config.isHaApp || !config.allowRegistration) return c.json({ error: "Registration is disabled", code: "registration_disabled" }, 403);
  const ip = clientIp(c);
  if (throttled(ip)) return c.json({ error: "Too many attempts, try again later", code: "too_many_attempts" }, 429);
  const { username, password, email } = await c.req.json<{ username?: string; password?: string; email?: string }>();
  try {
    return startSession(c, await register(String(username ?? ""), String(password ?? ""), String(email ?? "")));
  } catch (e) {
    recordFail(ip);
    return c.json({ error: (e as Error).message, code: e instanceof UserError ? e.code : undefined }, 400);
  }
});

authRoutes.post("/login", async (c) => {
  if (config.isHaApp) return c.json({ error: "Signed in via Home Assistant" }, 400);
  const ip = clientIp(c);
  if (throttled(ip)) return c.json({ error: "Too many attempts, try again later", code: "too_many_attempts" }, 429);
  const { username, password } = await c.req.json<{ username?: string; password?: string }>();
  const user = await authenticate(String(username ?? ""), String(password ?? ""));
  if (!user) {
    recordFail(ip);
    return c.json({ error: "Wrong username or password", code: "wrong_credentials" }, 401);
  }
  return startSession(c, user);
});

// ---------- Password reset by mail ----------

/** Reset requests per IP: few, they send mail. */
const MAX_FORGOT = 5;
const forgot = new Map<string, { n: number; resetAt: number }>();

/**
 * Always answers the same, whether the account exists, has an e-mail or was just sent a link, so
 * the form cannot be used to find out who has an account. The mail goes out in the background:
 * waiting for the mail server would make the answer slower for real accounts.
 */
authRoutes.post("/forgot", async (c) => {
  if (!mailEnabled()) return c.json({ error: "Password reset by mail is not set up", code: "reset_disabled" }, 404);
  const ip = clientIp(c);
  const f = forgot.get(ip);
  if (f && f.resetAt < Date.now()) forgot.delete(ip);
  const entry = forgot.get(ip) ?? { n: 0, resetAt: Date.now() + WINDOW_MS };
  if (entry.n >= MAX_FORGOT) return c.json({ error: "Too many attempts, try again later", code: "too_many_attempts" }, 429);
  entry.n++;
  forgot.set(ip, entry);

  const { identifier, lang } = await c.req.json<{ identifier?: string; lang?: string }>();
  const reset = createResetToken(String(identifier ?? "").slice(0, 254));
  if (reset) {
    sendResetMail(reset.email, reset.username, reset.token, String(lang ?? ""), RESET_MINUTES).catch((e) =>
      console.error(`Password reset mail for ${reset.username} failed: ${(e as Error).message}`),
    );
  }
  return c.json({ ok: true });
});

authRoutes.post("/reset", async (c) => {
  if (config.isHaApp) return c.json({ error: "Signed in via Home Assistant" }, 400);
  const ip = clientIp(c);
  if (throttled(ip)) return c.json({ error: "Too many attempts, try again later", code: "too_many_attempts" }, 429);
  const { token, password } = await c.req.json<{ token?: string; password?: string }>();
  try {
    return startSession(c, await resetPassword(String(token ?? ""), String(password ?? "")));
  } catch (e) {
    if (e instanceof UserError && e.code === "reset_invalid") recordFail(ip);
    return c.json({ error: (e as Error).message, code: e instanceof UserError ? e.code : undefined }, 400);
  }
});

authRoutes.post("/logout", (c) => {
  const token = getCookie(c, COOKIE);
  if (token) destroySession(token);
  deleteCookie(c, COOKIE, { path: "/" });
  return c.json({ ok: true });
});
