# Deployment

**Production:** https://devpulse-v2-delta.vercel.app (Vercel project `devpulse-v2`, team scope `nirali-desai-3979`, Hobby plan).

> Two Vercel projects deploy from this repo. **`devpulse-v2`** serves `main` (this v2 app). **`devpulse`** was created by a parallel session for the v1 `roadmap` branch. Both share the Supabase project `oxibeeaaelnavkjngneg`; the v2 migrations are additive.

## First-time setup (what was done)

```bash
npx vercel link --yes --project devpulse-v2 --scope nirali-desai-3979   # creates the project, connects GitHub
# production env vars, values piped from .env.local, never printed; secrets marked sensitive:
printf %s "$VALUE" | npx vercel env add NAME production --sensitive --scope nirali-desai-3979
npx vercel deploy --prod --yes --scope nirali-desai-3979
```

Production env vars:

- `NEXT_PUBLIC_SUPABASE_URL`, `GEMINI_MODEL` and `REPORT_TIMEZONE` are plain.
- These are sensitive: `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GITHUB_TOKEN`, `RESEND_API_KEY`, `BRIEF_TO_EMAIL`, `CRON_SECRET` and `ADMIN_PASSCODE`.

`CRON_SECRET` must be set on the project; Vercel Cron sends it as a Bearer token. `VERCEL_PROJECT_PRODUCTION_URL` (a Vercel system variable) is used for links in emails.

## Database

Apply `supabase/migrations/*` in order: `npm run db:migrate` with `SUPABASE_DB_URL`, or paste `supabase/SETUP_V2.sql` into the Supabase SQL editor. The v2 setup was applied on 12 Oct 2026 through the SQL editor, with "Run and enable RLS".

## Verify a deployment

```bash
curl -s https://devpulse-v2-delta.vercel.app/api/health          # database.ok, gemini model, configured flags
curl -s -o /dev/null -w "%{http_code}" https://devpulse-v2-delta.vercel.app/api/cron/weekly   # 401 without secret
npx vercel crons ls --scope nirali-desai-3979                       # /api/cron/weekly 30 2 * * 5
E2E_BASE_URL=https://devpulse-v2-delta.vercel.app E2E_ADMIN_PASSCODE=… npm run test:e2e
```

## Notes

- Function duration: routes that run the pipeline export `maxDuration = 300`.
- Crons run only on production deployments. Hobby precision is ±59 minutes.
- Deployment protection: the production domain `devpulse-v2-delta.vercel.app` is public. Per-deployment URLs (`devpulse-v2-<hash>-…vercel.app`) are protected by Vercel Authentication, which is the account default.
- Supabase advisors (12 Oct 2026):
  - Security: only INFO "RLS enabled, no policy". This is intended (deny-all for browser roles).
  - Performance: INFO "unindexed foreign keys" on low-volume audit columns, and "unused index" on a new database. Both are acceptable at this scale.
