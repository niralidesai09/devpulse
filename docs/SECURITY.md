# Security model

## Access model

| Who | Can | How it is enforced |
|---|---|---|
| Anyone with the URL | Read the dashboard, pain points, discussions, reports and exports | Public by design: the data is public developer discussion. Server-rendered; no database credentials reach the browser. |
| Admin (knows `ADMIN_PASSCODE`) | Edit topics/keywords/sources, run collections, generate briefs, exclude discussions, record decisions | `/login` sets an httpOnly, `SameSite=Lax`, `Secure` (in production) cookie holding `expiry.HMAC_SHA256(expiry)`. Every Server Action calls `requireAdmin()`; every admin Route Handler calls `requestIsAdmin()`. Hidden buttons are not the protection. |
| Vercel Cron | Trigger the weekly run | `Authorization: Bearer CRON_SECRET`, constant-time compared. |

The session signing key is derived from `CRON_SECRET` and `ADMIN_PASSCODE`, so changing either one invalidates every session. Login has a fixed delay to slow guessing. There is no distributed rate limiting (see limitations).

CSRF: admin mutations are Server Actions, whose Origin is checked by Next.js, or POST route handlers that rely on a `SameSite=Lax` cookie, which browsers do not send on cross-site POSTs.

## Secrets

- All secrets are server-only env vars (no `NEXT_PUBLIC_` prefix): `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GITHUB_TOKEN`, `RESEND_API_KEY`, `CRON_SECRET`, `ADMIN_PASSCODE`.
- `.env*` is git-ignored except `.env.example`. Before each commit, the staged files are scanned for the actual secret values.
- `GET /api/health` reports only booleans: whether each integration is configured.
- Logs never include credentials or full payloads.

## Database

- RLS is enabled on every v2 table, with **no** policies for `anon`/`authenticated`, and table grants are revoked from those roles. The public anon key can read nothing in v2.
- `ingest_discussions()` is `SECURITY INVOKER` with an empty `search_path`, and is executable only by `service_role`.
- Writes go through the service-role key on the server only (`lib/db/client.ts` throws if called in a browser).
- Note: `topics` keeps its v1 public-read policy because the shared v1 branch reads it with the anon key. Topic names and keywords are not sensitive.

## Untrusted content

- External text is plain text after `cleanText`. It is rendered as React text, which is escaped, so no `dangerouslySetInnerHTML` is used for it. The only `innerHTML` is the Mermaid SVG, built from our own constant with `securityLevel: "strict"`.
- Links are rendered only when they are `http(s)` (`isSafeHttpUrl`), with `rel="noopener noreferrer nofollow"`.
- AI output is schema-validated. It can only reference keys that code created. It never controls queries, URLs or code.
- Prompt injection: discussions are delimited, length-capped and declared untrusted in every system prompt (see ARCHITECTURE → AI design).

## Inputs

All Server Actions validate input with Zod:

- names 2–80 characters
- keywords 2–80 characters, with no `<`, `>` or `"`
- rationale ≤ 1000 characters
- ids must be UUIDs
- enums for decisions and sources

Duplicate topic names and keywords are rejected by unique indexes and reported in plain language. Explorer search terms are stripped of PostgREST control characters and capped at 100 characters.
