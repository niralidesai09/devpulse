import { beforeEach, describe, expect, it } from "vitest";
import { checkPasscode, hasCronSecret, requestIsAdmin, signSession, verifySession } from "@/lib/auth";

beforeEach(() => {
  process.env.CRON_SECRET = "cron-secret-for-tests";
  process.env.ADMIN_PASSCODE = "correct horse";
});

describe("admin session", () => {
  it("accepts a signed, unexpired token", () => {
    expect(verifySession(signSession(Date.now() + 60_000))).toBe(true);
  });
  it("rejects expired, tampered and empty tokens", () => {
    expect(verifySession(signSession(Date.now() - 1))).toBe(false);
    const t = signSession(Date.now() + 60_000);
    expect(verifySession(t.slice(0, -2) + "xx")).toBe(false);
    expect(verifySession(`${Date.now() + 9e9}.${t.split(".")[1]}`)).toBe(false); // extended expiry, old signature
    expect(verifySession(undefined)).toBe(false);
  });
  it("invalidates sessions when the passcode changes", () => {
    const t = signSession(Date.now() + 60_000);
    process.env.ADMIN_PASSCODE = "new passcode";
    expect(verifySession(t)).toBe(false);
  });
  it("denies everything when the passcode is not configured", () => {
    delete process.env.ADMIN_PASSCODE;
    expect(checkPasscode("")).toBe(false);
    expect(checkPasscode("anything")).toBe(false);
  });
});

describe("request auth", () => {
  it("accepts the cron bearer secret and nothing else", () => {
    expect(hasCronSecret(new Request("http://x", { headers: { authorization: "Bearer cron-secret-for-tests" } }))).toBe(true);
    expect(hasCronSecret(new Request("http://x", { headers: { authorization: "Bearer wrong" } }))).toBe(false);
    expect(hasCronSecret(new Request("http://x"))).toBe(false);
  });
  it("accepts a valid session cookie", () => {
    const cookie = `other=1; dp_admin=${encodeURIComponent(signSession(Date.now() + 60_000))}`;
    expect(requestIsAdmin(new Request("http://x", { headers: { cookie } }))).toBe(true);
    expect(requestIsAdmin(new Request("http://x", { headers: { cookie: "dp_admin=forged.value" } }))).toBe(false);
  });
});
