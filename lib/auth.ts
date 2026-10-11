// Checks whether a request carries "Authorization: Bearer <CRON_SECRET>".
// Vercel Cron sends exactly this header, and we use the same secret to
// protect debug endpoints and the "Run now" button.

import { timingSafeEqual } from "node:crypto";

export function hasCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // no secret configured = nobody gets in

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  // timingSafeEqual compares in constant time so attackers can't guess
  // the secret character by character from response times.
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
