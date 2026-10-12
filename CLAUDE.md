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

## Roadmap (Steps 4–11)
After EACH step: run it to verify with live data, commit + push, update Progress, explain simply, give a URL to check, 3 viva Q&As, then STOP and wait for "next".

### Step 4 — Gemini classifier (lib/ai)
- lib/ai/gemini.ts using @google/genai and GEMINI_MODEL. First list available models with the key and confirm the model name works; if not, switch to the newest available Flash model and say so.
- Classify posts in batches of ~25 using JSON output with a response schema; validate with Zod; retry once on invalid JSON; back off and retry on 429 rate limits.
- Per post: topic_id (or null if irrelevant — drop those), pain_point (one line), is_unresolved + reason (use source signals like no accepted answer / issue still open as evidence), sentiment (-1 to 1), severity 1-5, competitors mentioned (e.g. SonarQube, CodeRabbit, GitHub Copilot review, Graphite, Reviewable).
- Debug endpoint /api/debug/classify (same protection as /api/debug/sources) showing results for 10 live posts.

### Step 5 — Pipeline + trend engine (lib/pipeline)
- runPipeline(): create a runs row, collect posts, classify, save posts, compute topic_stats, mark run done/failed, record per-source status.
- Trend: this week's count per topic vs last week. SMART BASELINE: also fetch counts for the PREVIOUS 7-day window (days 8–14 ago) using keyword matching from sources that support date ranges. Use keyword-match counts for BOTH weeks so the comparison is fair. Show change % with ▲/▼ and "new" when last week was 0.
- Opportunity Score (0-100) = normalised(mention count) × growth factor × unresolved ratio × avg severity. Store each component so the UI can show "why this score".
- Fit Vercel's function time limit: maxDuration, limited Gemini parallelism, cap posts at 300.

### Step 6 — The Friday brief + email
- Gemini writes markdown: 1) TL;DR 3 bullets, 2) Top pain points table (topic, mentions, trend %, unresolved %, opportunity score), 3) Rising & falling, 4) Unresolved / underserved, 5) Emerging topics not yet monitored, 6) Competitor radar, 7) Likely sales objections + suggested response, 8) "Bring these 3 things to Monday sprint planning". Every claim links to real thread URLs. Never invent numbers — pass computed stats in, use only them.
- Save to briefs; send clean HTML email via Resend (from onboarding@resend.dev) to BRIEF_TO_EMAIL; store emailed_at.

### Step 7 — Dashboard, cron, deploy
- "/" latest brief + KPI cards + week-over-week trend chart (Recharts) + topics ranked by opportunity score with evidence links; "/topics" add/edit/pause topics + keywords (ADMIN_PASSCODE; add to .env.example, generate in .env.local); "/runs" history with per-source status.
- Protected "Run now" button (ADMIN_PASSCODE).
- vercel.json cron "30 2 * * 5" (= Fri 8:00 IST) → /api/cron/weekly, checks Authorization: Bearer CRON_SECRET.
- Deploy to Vercel (MCP or CLI), connect GitHub repo, copy env vars (never print values), trigger one production run. Give the public URL.
- Clean, professional, mobile-friendly design.

### Step 8 — Opportunity Score explainer ⭐
"Why this score" per topic: frequency, growth, unresolved %, severity, + top 3 evidence threads.

### Step 9 — Emerging Topic Radar ⭐
Gemini clusters posts that don't fit existing topics into suggested topics (keywords + evidence links) → suggested_topics. Dashboard Approve / Reject (ADMIN_PASSCODE); Approve inserts into topics.

### Step 10 — Competitor & Objection Radar + "Ask the Pulse" ⭐
- Competitor panel: mentions + avg sentiment per tool, with links.
- Objection panel: common objections to code review automation + suggested responses.
- "Ask the Pulse": Postgres full-text search over stored posts; Gemini answers ONLY from them with link citations; "not enough data" if nothing relevant.

### Step 11 — Submission pack
- docs/COMPONENTS_MAP.md AND /architecture page with diagram (every component, service used, data flow).
- README.md: what it does, live URL, setup, env vars, how cron works.
- VIVA.md: 25 viva Q&As + 3-minute demo script.
- Final checks: prove no Anthropic/Claude API, no mock data in production paths, no secrets committed; production site loads with live data.

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
- Supabase migrations applied: `create_devpulse_schema`, `seed_starter_topics`. Same SQL saved in `supabase/migrations/0001_initial_schema.sql` and `0002_seed_starter_topics.sql` (originally schema.sql / seed.sql).
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

### Step 4 — Gemini classifier ✅ (2026-10-11)
- Model check: listed models with the key. `gemini-2.5-flash` returns 404 "no longer available to new users" → switched GEMINI_MODEL to **`gemini-3.8-flash`** (newest Flash) in `.env.local` and `.env.example`. Remember to use this value on Vercel.
- `lib/ai/gemini.ts`: `generateJson({system, prompt, schema})` — Zod schema → JSON Schema (`z.toJSONSchema`) sent as `responseJsonSchema`; reply validated with Zod, retried ONCE if invalid; 429/5xx → wait (Google's `retryDelay` or 2s/4s/8s/16s) and retry up to 4 times. `thinkingLevel: LOW`, temperature 0.2.
- `lib/ai/classify.ts`: `classifyPosts(posts, topics)` — batches of 25, 3 batches in parallel (reuses `mapWithLimit`). Topics sent as short keys T1..Tn, posts as p1..p25, mapped back in code. Topic enum includes `"irrelevant"` → those posts are dropped (with Gemini's reason). Source signals (GitHub open/closed, SO accepted answer) are passed as evidence for is_unresolved. Competitor names normalised to a canonical list (SonarQube, CodeRabbit, GitHub Copilot code review, Graphite, Reviewable, Codacy, DeepSource, Qodo, Greptile, Sourcery, Cursor Bugbot, Semgrep, Snyk Code). Never throws: failed batches go to `errors`.
- Migration `step4_numeric_sentiment_and_fp_keywords`: `posts.sentiment` is now numeric -1..1; "False positives / noisy review bots" keywords widened (+ 'false positive rate', 'too many false positives', 'AI review comments', 'nitpicks') because it had 0 matches. migration files 0001 / 0002 updated.
- `GET /api/debug/classify?n=10` (max 50): same protection as /api/debug/sources (verified 401 without/with wrong secret in `next start`).
- Live results (2026-10-11): 150 posts collected. n=10 → 5 kept / 5 dropped in 5s. n=50 → 15 kept / 35 dropped in 15s (2 batches, 0 errors); kept per topic: AI trust 8, flaky tests 4, false positives 2, bottlenecks 1. Most drops are GitHub agent-written planning tickets and product announcements, which is the relevance filter working as intended.

### Step 5 — Pipeline + trend engine ✅ (2026-10-11)
- **Fixed env:** `SUPABASE_SERVICE_ROLE_KEY` held a *publishable* key (read-only; Steps 2–3 only read so it went unnoticed) → user replaced it with the `sb_secret_…` key. Use the secret key on Vercel too.
- SQL files now live in `supabase/migrations/` (0001 schema, 0002 seed, 0003 Step 5). New migration `step5_pipeline_trend_score_columns`: runs.trigger + runs.stats; posts.matched_keyword; topic_stats: prev_mention_count → baseline_last_week, + baseline_this_week, trend, trend_detail, avg_sentiment, score_frequency/growth/unresolved/severity/raw.
- `lib/pipeline/run.ts` `runPipeline(trigger)`: fails runs stuck in "running" > 15 min, refuses to start if one is running → creates run → topics → `collectAll` → **in parallel** `classifyPosts` + `countBaseline` → upsert kept posts → insert topic_stats (one row per active topic, even 0 mentions) → status success / partial (any source, Gemini batch or baseline error) / failed (error saved on the run).
- `lib/pipeline/baseline.ts` SMART BASELINE = **Hacker News only**: exact-phrase Algolia search (`advancedSyntax`), distinct post ids per topic, this week (run window) vs the 7 days before. If either week fails → topic trend "no_data" (never an unfair comparison).
  - Why not GitHub: tested title-only + bot-excluded counts, but GitHub's *secondary* rate limit (search compute budget) returns 403 on every extra search right after the collector's ~11 full-text searches, even paced 2.5s apart and 40s later. Dropped from baseline; GitHub still used for collection.
  - Why not DEV.to: no date search; tag "ai" gets 1000+ posts/day.
- `lib/pipeline/scoring.ts` (pure functions): trend up/down/flat (±5%)/new (last week 0)/no_data; `formatTrend` → "▲ 25%", "▼ 10%", "→ 0%", "new", "–". Opportunity Score: frequency = mentions/max mentions; growth = (this+3)/(last+3) clamped 0.5–2 (the +3 smoothing stops 2-vs-0 from dominating); unresolved = unresolved/mentions; severity = avg/5; raw = product; score = raw/max raw × 100.
- DEV.to collector: `per_page` 100 → 1000 (100 covered only a few hours of busy tags) → 13 → 28 matched DEV.to posts.
- Routes: `GET /api/cron/weekly` (maxDuration 300, ALWAYS needs Bearer CRON_SECRET, 409 if a run is in progress); `GET /api/debug/latest-run` (dev open / prod secret): latest run, sources, topics ranked by score with trend, keyword matches, "why this score" components and top-3 evidence by engagement. Verified 401 (no header / wrong secret) on all protected routes in `next start`.
- Live run (2026-10-11, 43s): HN 42, SO 0, GitHub 122, DEV.to 28 → 157 collected, 58 kept, 99 dropped, 7 Gemini batches, 0 errors, status **success**. Ranking: Flaky tests 100 (new, 15 mentions), CI/CD 59, Code review bottlenecks 42, Trust in AI code review 26 (▼45%, most mentions 18), False positives 18 (▼55%), PR size 10.
- Known limits: HN baseline counts are small (0–20/week) so trends are noisy; some kept GitHub posts are borderline (agent-written tickets) — evidence links are ranked by engagement.

**Next:** Step 6 (not started). *(Superseded on `main` by v2 below; v1 Steps 5+ continue on branch `roadmap`.)*

### v2 — Evidence-backed intelligence product ✅ (2026-10-12, branch `main`)
- Live: https://devpulse-v2-delta.vercel.app (Vercel project **devpulse-v2**; the `devpulse` project belongs to the v1/roadmap session). Deploy with `npx vercel deploy --prod --scope nirali-desai-3979`.
- Schema v2 (`supabase/migrations/0005`, `0006`; paste-ready `supabase/SETUP_V2.sql`), **additive** — v1 tables untouched because the DB is shared with `roadmap`: topic_keywords, sources, collection_runs, source_runs, discussions (unique source+id, url_normalized), discussion_analysis, pain_points (merged_into), reports, report_pain_points, report_evidence, pain_point_decisions. RLS deny-all for anon.
- Pipeline `lib/pipeline/run.ts`: collect (4 adapters) → idempotent ingest (`ingest_discussions()`) → Gemini Stage A analyse (verbatim quote check) → Stage B consolidate → Stage B2 merge → code metrics (IST Fri–Thu weeks, like-for-like untruncated sources, min-sample rules, signal score) → Stage C grounded brief → snapshot + evidence → Resend. Time-boxed to 285 s.
- UI: Overview, Pain points (+detail, decisions, evidence graph), Opportunities, Discussions explorer, Reports (+compare, print, MD/JSON export), Decisions, Data health, Settings (topic/keyword/source CRUD), Architecture, Login (ADMIN_PASSCODE, HMAC cookie).
- Verified live 12 Oct: 455 discussions (HN 115, GitHub 261, DEV 78, SO 1), 201 relevant, 51 pain points, 3 briefs, 2 emails sent; prod cron 401/200/skipped-duplicate. Tests: 105 unit/integration, live sources/Gemini/DB, Playwright e2e on prod (desktop+mobile).
- Docs: README, docs/* (ARCHITECTURE, COMPONENTS_MAP, DATA_SOURCES, API, SECURITY, TESTING, DEPLOYMENT, LIMITATIONS, DEMO_SCRIPT, VIVA_GUIDE, SUBMISSION_CHECKLIST).
