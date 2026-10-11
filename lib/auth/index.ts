// Access model (documented in docs/SECURITY.md):
//   * Reading the dashboard is public — it shows public developer discussions.
//   * Anything that writes data or spends API quota (topic edits, runs,
//     report generation, exclusions, decisions) requires an admin session.
//   * Admin session = an httpOnly, SameSite=Lax cookie holding an expiry and an
//     HMAC-SHA256 signature. You get one by entering ADMIN_PASSCODE at /login.
//   * Vercel Cron authenticates with "Authorization: Bearer CRON_SECRET".
// Every check runs on the server; hiding a button is never the protection.

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { connection } from "next/server";

export const SESSION_COOKIE = "dp_admin";
const SESSION_DAYS = 7;

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** "Authorization: Bearer <CRON_SECRET>" — what Vercel Cron sends. */
export function hasCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`);
}

export function isAdminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSCODE && process.env.CRON_SECRET);
}

// Signing key derived from both secrets: changing the passcode logs everyone out.
function signingKey(): string {
  return `devpulse-session:${process.env.CRON_SECRET}:${process.env.ADMIN_PASSCODE}`;
}

export function signSession(expiresAt: number): string {
  const sig = createHmac("sha256", signingKey()).update(String(expiresAt)).digest("base64url");
  return `${expiresAt}.${sig}`;
}

export function verifySession(token: string | undefined, now = Date.now()): boolean {
  if (!token || !isAdminConfigured()) return false;
  const [exp, sig] = token.split(".");
  const expiresAt = Number(exp);
  if (!Number.isFinite(expiresAt) || expiresAt < now || !sig) return false;
  return safeEqual(signSession(expiresAt), token);
}

export function checkPasscode(input: string): boolean {
  const expected = process.env.ADMIN_PASSCODE;
  if (!expected || !isAdminConfigured()) return false;
  return safeEqual(input, expected);
}

export function newSessionCookie() {
  const expiresAt = Date.now() + SESSION_DAYS * 86_400_000;
  return {
    name: SESSION_COOKIE,
    value: signSession(expiresAt),
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      expires: new Date(expiresAt),
    },
  };
}

export async function isAdmin(): Promise<boolean> {
  await connection(); // request-time only: depends on the cookie and the current time
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Admin access required. Sign in with the admin passcode.");
    this.name = "UnauthorizedError";
  }
}

/** Throw unless the current request has a valid admin session. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new UnauthorizedError();
}

/** For Route Handlers: admin cookie OR cron secret. */
export function requestIsAdmin(request: Request): boolean {
  if (hasCronSecret(request)) return true;
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return verifySession(match ? decodeURIComponent(match[1]) : undefined);
}
