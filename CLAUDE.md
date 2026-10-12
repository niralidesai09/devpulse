@AGENTS.md

# Project: Groundswell (formerly DevPulse) — Weekly Developer Community Intelligence Digest
Tagline: "Catch developer pain before it peaks." (Renamed 2026-10-12; repo, Vercel project and URLs keep the name "devpulse".)

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

- **Two sessions, two copies (2026-10-11):** another session ("Developer Community Pulse product build") is building a "v2" redesign in `~/devpulse` on `main`. Its unfinished files were accidentally swept into commit d88f084 by `git add -A`. The roadmap continues in the git worktree **`~/devpulse-roadmap` on branch `roadmap`**, which removes those files and restores Step 4's `lib/sources/types.ts`, `utils.ts`, `package.json`. Verified there: tsc, lint, build pass; live run success (153 collected, 61 kept, 41s). Both copies share ONE Supabase database — schema changes from either side affect the other. Always `git add` specific paths, never `-A`.

### Step 6 — Friday brief + email ✅ (2026-10-11)
- `lib/pipeline/brief.ts`: `loadBriefData(runId)` (from DB: run, topic_stats, posts, pending suggested_topics) → `writeBrief` → `createBrief` (upsert into briefs, one per run). Gemini returns structured JSON (Zod: tldr×3, rising_falling, unresolved, emerging, competitor_commentary, objections 2–4, sprint×3); CODE assembles the markdown with all 8 sections.
  - **No invented numbers:** the pain-point table and competitor table are rendered by code from topic_stats/posts; Gemini's text is checked — every number must appear in its input (`checks.unverifiedNumbers`).
  - **No invented links:** evidence posts get ids E1..E120; Gemini cites `[E3]`, code replaces with real `[Source](url)` links; links/URLs typed by Gemini are stripped; unknown ids counted (`checks.unknownRefs`).
  - Objection responses are honest talking points (Gemini doesn't know the product's features). Thinking LOW: 13–15s (MEDIUM took 69s with similar quality).
- `lib/markdown.ts`: `markdownToHtml` (marked 18, GFM tables; raw HTML escaped, only http(s) links, open in new tab) — reused by the dashboard in Step 7.
- `lib/email/brief-email.ts`: `briefEmailHtml` (email-safe template) + `sendBriefEmail(briefId)` via Resend from `onboarding@resend.dev` to BRIEF_TO_EMAIL, HTML + plain-text; stores `emailed_at` or `email_error`. Never throws.
- Pipeline now: save run window/sources/stats → createBrief → sendBriefEmail → status (brief or email failure ⇒ "partial", data kept).
- Migration `step6_brief_metadata` (0004): briefs.model, email_error, checks.
- `GET /api/debug/brief` (dev open / prod secret, 401 verified): latest brief as the email HTML; `?format=md` JSON; `?regenerate=1` re-write; `?email=1` re-send.
- Live end-to-end run (2026-10-11, 71s): 149 collected, 62 kept, brief written in 15s with 26 evidence links, 0 unknown refs, 0 unverified numbers; **email sent** (emailed_at stored).

### Step 7 — Dashboard, cron, deploy ✅ (2026-10-12)
- Pages (all `await connection()` + root `loading.tsx` as the Suspense boundary): `/` KPI cards, topics ranked by Opportunity Score with top-3 evidence, week-over-week Recharts chart (HN keyword matches this vs last week; blue = this week, orange = last week; two-line ticks show "11 vs 20 · ▼ 45%"; table view in <details>), latest brief (`markdownToHtml`) with email status; `/topics` add / edit / pause / resume (server actions in `app/actions.ts`, Zod-validated); `/runs` history with per-source chips, brief/email status, issues.
- Admin: `ADMIN_PASSCODE` (in .env.example; generated in .env.local). `lib/admin.ts`: httpOnly cookie = HMAC-SHA256(passcode, "devpulse-admin-v1"), constant-time compare, 7 days. Every action re-checks it. `POST /api/run` (maxDuration 300) = "Run now"; `components/run-now.tsx` shows a live seconds counter then `router.refresh()`.
- Design: IBM Plex Sans/Mono, CSS-variable tokens for light + dark (`app/globals.css`), mobile-first (no horizontal scroll at 375px). Chart palette = dataviz reference slots 1–2 (a gray "last week" failed the chroma/contrast checks).
- `vercel.json` cron `30 2 * * 5` (Fri 08:00 IST) → `/api/cron/weekly` (Bearer CRON_SECRET).
- Verified locally: wrong passcode rejected; unlock; pause/resume reflected in DB; invalid topic rejected; **Run now** from the UI → "success · 60 relevant posts · brief emailed".
- Vercel (CLI, account `nirali-desai-3979`; the Vercel MCP is logged into a different account): project `devpulse` (prj_I3JkGmWb5wRTwt46nvd6Sg75u9s1), Git-connected to niralidesai09/devpulse, **production branch = `roadmap`** (set via `PATCH /v9/projects/devpulse/branch`, user-approved), Vercel Authentication limited to **preview** so production is public. 10 production env vars copied from .env.local via stdin (values never printed; anon key as `--type config`).
- Hobby plan blocks deployments whose commit author isn't linked to the account → commits must use `331916117+niralidesai09@users.noreply.github.com` (set per-commit with GIT_AUTHOR_EMAIL/GIT_COMMITTER_EMAIL; no shared git config changed).

- Live: **https://devpulse-sable-seven.vercel.app** (production run 2026-10-12: 84s, 256 collected, 59 kept, email sent). Cron registered (`vercel crons ls`: /api/cron/weekly 30 2 * * 5). All protected endpoints 401 without secret/cookie. The other session's 2 v2 topics are now in `topics`, so runs monitor 8 topics.

### Step 8 — Opportunity Score explainer ✅ (2026-10-12)
- `components/score-explainer.tsx` (server component, `<details>` "Why this score?" on every topic card with mentions): 4 factors with value, bar and plain-English inputs — frequency ("12 posts vs 14 for the most-discussed topic X"), growth on a ×0.5–×2 track filled from the ×1 mark ("(2 + 3) ÷ (0 + 3)"), unresolved ("10 of 12 posts…"), severity ("average 3.2 of 5" + scale); strongest / weakest factor sentence; the exact maths (`a × b × c × d = raw`, `raw ÷ max raw × 100 = score`). All text built by code from stored numbers — no AI.
- Evidence ("Top evidence", top 3 per topic) now ranked by what justifies the score: unresolved first, then severity, then engagement; shows Resolved/Unresolved, severity and the unresolved reason.
- `scoring.ts`: components rounded to 4 dp BEFORE multiplying (was 3 dp after), so the shown maths always multiplies out. Verified: unit check + all 8 live formulas recomputed from the production HTML → product and score match.
- Mobile fix: grid gets `grid-cols-[minmax(0,1fr)]` below lg (an open panel made the page 409px wide at 375px; now 375px with all panels open).

### Step 9 — Emerging Topic Radar ✅ (2026-10-12)
- Classifier has a 3rd outcome **`other`** = a real pain point in Sumit's space that no monitored topic fits ("don't force a weak match"). Those posts are saved with `topic_id = null` (not dropped). Brief evidence labels them "Not monitored yet".
- `lib/pipeline/radar.ts` `runEmergingTopicRadar(runId, unmatched, topics)`: needs ≥3 unmatched posts; Gemini (structured JSON, Zod) clusters up to 80 of them into ≤4 suggestions {name, description, rationale, keywords 5–8, evidence ids}. Code checks: ≥2 real evidence posts; name not an existing topic or ANY earlier suggestion (pending/approved/rejected → rejected ideas don't return); keywords already monitored removed, ≥3 must remain. Saved to `suggested_topics` (status pending, evidence_urls, post_count).
- Runs in the pipeline after topic_stats and BEFORE the brief (brief section 5 mentions pending suggestions). Radar error ⇒ run "partial".
- Migration `step9_emerging_topic_radar` (0005_step9_…): suggested_topics + description, rationale, post_count, decided_at, topic_id (→ topics, set null).
- `decideSuggestionAction` (admin cookie): approve → insert into topics (active, same keywords) + status approved, decided_at, topic_id; reject → status rejected. Dashboard panel `components/emerging-radar.tsx` (+ `suggestion-buttons.tsx`): pending cards (description, why it matters, keyword chips, evidence links, Approve & monitor / Reject when unlocked) + "Recently decided".
- Live run (2026-10-12, local, 95s): 250 collected, 81 kept, **12 unmatched → 3 suggestions** (Bot Review Follow-up Tracking, AI Review Compliance Gating, Branch Protection Ruleset Configuration), 0 rejected by checks. UI test: approved "Branch Protection Ruleset Configuration" → now an active topic with its 5 keywords; rejected "AI Review Compliance Gating". (Brief self-check caught 1 unknown evidence id from Gemini and removed it.)

### Step 10 — Competitor & Objection Radar + "Ask the Pulse" ✅ (2026-10-12)
- Migration `step10_search_and_objections` (0006_step10_…): `posts.fts` generated tsvector (english: title + pain_point + snippet) + GIN index; `public.search_posts(q, max_results)` — question → English lexemes (stop words removed, stemmed), each `quote_literal`-ed and OR-ed into a `simple` tsquery (user input can't break syntax), ranked by `ts_rank_cd`, `DISTINCT ON (url)` newest copy, max 30; `search_path = ''`; EXECUTE only for service_role. `briefs.objections` jsonb.
- Competitor panel (`components/competitor-panel.tsx`): computed in `getDashboard` from the latest run's posts.competitors — mentions, avg sentiment (−1..1, label negative/mixed/positive), # negative, top 3 threads; centred bar (orange negative / blue positive) + number + word.
- Objection panel (`components/objections-panel.tsx`): `createBrief` now also stores the brief's objections as data (`{objection, response, evidence[{url,title,source}]}`, real evidence only) — no extra Gemini call.
- Ask the Pulse: `lib/ai/ask.ts` `askThePulse(q)` → `search_posts` (12) → none ⇒ "Not enough data" without calling Gemini; else Gemini (posts S1..S12 only, Zod `{enough_data, answer}`) → code turns `[S#]` into links, strips URLs Gemini typed, unknown ids dropped; no valid citation ⇒ "not enough data". `POST /api/ask` public, Zod 3–300 chars, 8/min per IP (in-memory). `components/ask-pulse.tsx` client chat with example questions; nav "Ask" → `/#ask`.
- Verified live: "Why do teams turn off AI code review bots?" → answer cites the real GitHub thread (its "28 … failures" numbers checked against the stored snippet); "best pizza topping in Naples?" → search found 6 loose matches but Gemini said not enough data; "hi" → 400. Full local run (117s, 9 topics now): 67 kept, 3 objections stored with evidence, email sent. Security advisor: only INFO for the v2 session's server-only tables.

### Step 11 — Submission pack ✅ (2026-10-12)
- Renamed the app to **Groundswell** (user's choice): header + tagline, page titles, brief heading/footer, email sender name/footer/subject, Ask copy, User-Agent "Groundswell/1.0". Kept on purpose: admin cookie name/HMAC label (changing logs users out), "Ask the Pulse" feature name, repo/Vercel names.
- `/architecture` (`app/architecture/page.tsx`, static): themed inline-SVG diagram (triggers → 4 sources → 6-step pipeline → Supabase / Resend inbox / dashboard, plus the Ask the Pulse path; legend: Gemini / external / our code / database), step-by-step run, exam-rules checklist, and the Components Map rendered from `lib/components-map.ts`. Nav: "How it works".
- `docs/COMPONENTS_MAP.md`, `README.md` (what it does, live URL, setup, env vars, cron), `VIVA.md` (3-minute demo script + 25 Q&As).
- Final checks: (1) "anthropic|claude" in app/, lib/, components/, supabase/, package.json, package-lock.json, vercel.json, next.config.ts → **0**; only AI dependency `@google/genai`, imported only by `lib/ai/gemini.ts` (CLAUDE.md is the coding assistant's notes, not app code). (2) mock|fake|dummy|lorem|faker|fixture in app code → only the sentence "nothing is mocked"; sources are the 4 live API hosts. (3) Secrets: every value from .env.local searched in the full history of all branches (17 commits) → 0; key-shaped patterns → 0; only `.env.example` ever committed. (4) Production run + live pages checked after deploy (see below).

**All roadmap steps complete.**
