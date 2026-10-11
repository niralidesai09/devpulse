// Admin passcode protection for "Run now" and topic editing.
//
// Sumit types ADMIN_PASSCODE once; we store a signed token in an httpOnly
// cookie (JavaScript in the browser cannot read it). The token is an HMAC
// of a fixed message keyed with the passcode, so:
//   - the passcode itself is never stored in the cookie
//   - changing ADMIN_PASSCODE logs everyone out automatically
// Server only: never import this from a Client Component.

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "devpulse_admin";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // stay unlocked for 7 days

/** The token a valid cookie must contain (null if no passcode is configured). */
function expectedToken(): string | null {
  const passcode = process.env.ADMIN_PASSCODE;
  if (!passcode) return null;
  return createHmac("sha256", passcode).update("devpulse-admin-v1").digest("hex");
}

/** Constant-time string compare (no timing hints for attackers). */
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Is this cookie value a valid admin token? */
export function isValidAdminToken(token: string | undefined): boolean {
  const expected = expectedToken();
  return Boolean(expected && token && safeEqual(token, expected));
}

/** For Server Components / Server Actions: is the current visitor admin? */
export async function isAdmin(): Promise<boolean> {
  return isValidAdminToken((await cookies()).get(ADMIN_COOKIE)?.value);
}

/** Check a typed passcode and, if right, set the admin cookie. */
export async function logIn(passcode: string): Promise<boolean> {
  const real = process.env.ADMIN_PASSCODE;
  if (!real || !safeEqual(passcode, real)) return false;
  (await cookies()).set(ADMIN_COOKIE, expectedToken()!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return true;
}

export async function logOut(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
}
