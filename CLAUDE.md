@AGENTS.md

# Project: DevPulse — Weekly Developer Community Intelligence Digest

## User
Sumit, sole PM at a 15-person startup making a code review automation tool for mid-size engineering teams. Every Friday morning he needs a brief of what developers are discussing about code review, CI/CD automation and developer workflow, before his afternoon engineering sync.

## The brief must answer
1. Which pain points are surfacing most often this week (with mention counts)
2. Is each pain point trending up or down vs last week (% change)
3. Which problems seem unresolved or underserved by existing tools

## Hard rules (exam requirements — never break)
- All AI tasks use Google Gemini Flash via the official @google/genai SDK. The model name comes from the GEMINI_MODEL env var. NEVER use the Anthropic/Claude API anywhere in the app code.
- Live external data only — no mock data in production code paths.
- Topic categories and keywords live in Supabase and are editable without code changes.
- Deployed on Vercel; scheduled with Vercel Cron every Friday morning IST.
- Secrets only in env vars; never commit .env files.

## Tools already connected
- Supabase MCP, scoped to project ref oxibeeaaelnavkjngneg (this is the DevPulse database — use it to create tables and read project URL/keys)
- Vercel MCP (my Vercel account)
- GitHub CLI `gh`, logged in as niralidesai09

## Stack
Next.js (App Router, TypeScript), Tailwind CSS, Supabase (Postgres), @google/genai, Resend (email), Recharts (charts), Zod (validate Gemini JSON output).

## Data sources (public, live)
- Hacker News via Algolia API (search_by_date endpoint) — no key
- Stack Overflow via Stack Exchange API v2.3 — optional key
- GitHub Issues search API — uses GITHUB_TOKEN
- DEV.to articles API — no key
Each source is a separate adapter in /lib/sources implementing one shared interface. If one source fails, the run continues and records which sources worked.

## Pipeline (one run)
1. Load active topics + keywords from Supabase
2. Fetch posts from the last 7 days from each source per keyword; dedupe by URL
3. Gemini Flash classifies posts in batches: topic, one-line pain point, is_unresolved (+ reason), sentiment, severity 1-5, competitor tools mentioned
4. Aggregate counts per topic and compare with the previous run -> trend %
5. Compute Opportunity Score per topic
6. Gemini writes the executive brief (markdown) with links to the real threads as evidence
7. Save everything to Supabase, email the brief via Resend, show it on the dashboard

## Differentiators (beyond the brief)
A. Opportunity Score = frequency x growth x unresolved ratio x severity, normalised 0-100
B. Emerging Topic Radar: Gemini finds recurring pain points not covered by existing keywords and saves them to suggested_topics; Sumit approves with one click and it becomes a monitored topic
C. Competitor & Sales Objection Radar: which competitor tools are mentioned and with what sentiment; map discussions to likely sales objections with a suggested response
D. "Ask the Pulse": dashboard chat answered by Gemini using only stored posts, always with citations
E. Evidence-first: every claim in the brief links to real threads
F. "Run now" button on the dashboard (protected) so the pipeline can be demoed live any day

## Env vars
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, GEMINI_MODEL, GITHUB_TOKEN, STACKEXCHANGE_KEY (optional), RESEND_API_KEY, BRIEF_TO_EMAIL, CRON_SECRET

## Working rules
- One step at a time. After each step, explain in plain simple English what was built and why, and exactly how to test it.
- Keep code simple and well commented — the user must explain it in a viva.
- After each step, update the "Progress" section at the bottom of this file.

## Step 1 (original instructions)
1. Scaffold a Next.js project in THIS folder (TypeScript, Tailwind, ESLint, App Router). Install @supabase/supabase-js, @google/genai, resend, recharts, zod.
2. Create folders: /lib/sources, /lib/ai, /lib/db, /lib/pipeline, /app/api.
3. Create .env.example listing all env vars, and make sure .gitignore excludes .env* files.
4. Create .env.local. Fill NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY using the Supabase MCP. Generate a random CRON_SECRET. Leave the other values blank and explain where to get each.
5. Make the home page show "DevPulse — setup OK".
6. Create a PUBLIC GitHub repo called devpulse using gh, commit, and push.
7. Give the command to run it locally and what should be seen.

## Progress
### Step 1 — Project setup ✅ (2026-10-11)
- Next.js 16.4 (App Router, TypeScript, Tailwind v4, ESLint) scaffolded in the project root.
- Installed: @supabase/supabase-js, @google/genai, resend, recharts, zod.
- Empty folders created (with .gitkeep): lib/sources, lib/ai, lib/db, lib/pipeline, app/api.
- `.env.example` committed; `.gitignore` ignores `.env*` except `.env.example`.
- `.env.local` created (not committed): Supabase URL + anon key filled, CRON_SECRET generated, GEMINI_MODEL defaulted to gemini-2.5-flash; other keys left for the user.
- Home page shows "DevPulse — setup OK". `npm run lint` and `npm run build` pass.
- Public GitHub repo: https://github.com/niralidesai09/devpulse

### Step 2 — Database ✅ (2026-10-11)
- All required env vars confirmed filled in `.env.local` (STACKEXCHANGE_KEY optional, empty).
- Supabase migrations applied: `create_devpulse_schema`, `seed_starter_topics`. Same SQL saved in `supabase/schema.sql` and `supabase/seed.sql`.
- Tables: topics, runs, posts (unique run_id+url), topic_stats (PK run_id+topic_id), briefs (one per run), suggested_topics (status pending/approved/rejected). FKs cascade from runs; topic deletes set posts.topic_id null.
- RLS on every table: anon/authenticated SELECT only; INSERT/UPDATE/DELETE revoked. Server writes use the service role key. Verified: anon insert/update → "permission denied".
- 6 starter topics seeded (6–7 keywords each).
- Security advisor: 0 issues. Performance advisor: only INFO "unused index" (expected on empty tables; kept).
- `lib/db/supabase.ts`: `createServerClient()` (service role, server only) and `createBrowserClient()` (anon, read-only), plus `Topic` type.
- `/topics` page lists topics + keywords (rendered per request via `await connection()`; `loading.tsx` shown while loading). Note: `next.config.ts` has `cacheComponents: true`.

### Step 3 — Live data collectors ✅ (2026-10-11)
- `lib/sources/types.ts`: `SourcePost`, `SourceResult`, `SourceAdapter` (`fetchPosts(topics, since)`).
- `lib/sources/utils.ts`: `fetchJson` (10s timeout, 1 retry, UA "DevPulse/1.0"), `mapWithLimit` (concurrency), `cleanText` (strip HTML), `snippetAround` (500-char snippet centred on the keyword), `matchTopic` (case-insensitive phrase match), `runSafely` (errors → ok:false, never throws).
- Adapters: `hackernews.ts` (Algolia, stories+comments, 1 req/keyword, concurrency 4), `stackoverflow.ts`, `github.ts`, `devto.ts` (10 tags via /articles/latest, concurrency 3).
- Deviations from the brief (on purpose):
  - Stack Overflow: SO gets only ~290 new questions/week site-wide, so instead of ~47 keyword searches we page ALL last-7-day questions via `/search/advanced` (~3 requests, saves the 300/day quota) and match locally. Result: **0 matches this week** — verified that none of the 287 questions contain any keyword even in the full body; sister sites (softwareengineering, devops, sqa) have ~0 traffic. Adapter works (ok:true); it is a data-volume issue.
  - GitHub: max 5 ORs per query (API returns "More than five AND / OR / NOT operators"), so keywords are chunked 6 per query → 1–2 queries per topic. Issues by `[bot]` accounts are skipped.
  - Keyword matching uses title + FULL body; the stored snippet is the 500 chars around the keyword (so the keyword is always in title or snippet).
- Keyword tuning: plain "false positives" matched mostly unrelated posts → replaced (migration `tune_false_positive_keywords`, seed.sql updated). "small pull requests" / "CodeRabbit" still bring some agent-written GitHub planning issues — Gemini relevance filtering in Step 4 should handle this (classifier needs an "irrelevant/not a pain point" outcome).
- `lib/sources/index.ts`: `collectAll(topics)` — adapters in parallel (Promise.allSettled), dedupe by normalised URL, cap 300 by score+comments, per-source status.
- `lib/db/topics.ts`: `getActiveTopics()`. `lib/auth.ts`: `hasCronSecret(request)` (constant-time compare).
- `GET /api/debug/sources`: open in dev; in production needs `Authorization: Bearer <CRON_SECRET>` (verified 401/401/200).
- Real run (2026-10-11): HN 31, SO 0, GitHub 122, DEV.to 12 → **135 posts** after dedupe. ~10s total.

**Next:** Step 4 (not started).
