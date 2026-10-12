# Viva preparation guide

Each topic has a **plain-English answer** (say this first), the **technical detail** (if asked to go deeper), and **likely follow-ups** with honest answers. Every claim here matches the code. File references let you show it.

---

## 1. Problem framing
**Plain:** Sumit spends 90 minutes every Friday reading developer forums, and still can't tell how often a problem comes up, whether it's growing, or whether tools already solve it. The product does the reading, counts recurrences properly, compares weeks fairly, and gives him an evidence-backed brief he can act on.
**Technical:** Three questions drive the design: frequency (unique discussions per canonical pain point), change (complete IST week vs the previous week, like-for-like sources), and underservedness (unresolved share, tool dissatisfaction, workarounds). Each has its own data and its own UI.
**Follow-ups**
- *Why not just a dashboard of keyword counts?* Keyword counts mix noise, duplicates and different wordings of one problem. We dedupe, filter relevance with AI, and group semantically.
- *Who is the user, really?* A PM making roadmap and interview decisions. That's why there's a decision log, interview questions and success criteria, not just charts.

## 2. Architecture choice
**Plain:** One Next.js app on Vercel, one Supabase database, four public APIs and Gemini Flash. No queues or extra services, because fewer moving parts means fewer things to break on demo day.
**Technical:** Server components read the database server-side; Server Actions and route handlers write. The pipeline runs inside one function invocation (≤ 300 s) with a time budget and resumable stages: pending analyses carry over, and a report can be regenerated from stored data. See `lib/pipeline/run.ts`.
**Follow-ups**
- *What if it doesn't fit in 300 s?* Analysis stops starting new batches when time runs low, and the rest stay `pending` for the next run. If there's no time for the brief, it's skipped with a recorded reason, never faked. The "Generate brief" button rebuilds it.
- *Why not a queue?* At tens to hundreds of discussions a week, a queue adds deployment risk for no benefit. It would be the next step at 10× volume.

## 3. Why Gemini Flash
**Plain:** It's required by the exam, and it fits: fast and cheap enough to classify hundreds of posts a week, with structured JSON output.
**Technical:** `@google/genai` with `responseJsonSchema` generated from Zod. The model id comes from `GEMINI_MODEL`, and `getModel()` refuses non-Flash ids. `gemini-2.5-flash` returned 404 for new users, so we use `gemini-3.8-flash` after listing available models. Thinking level is LOW for classification and MEDIUM for the brief.
**Follow-ups**
- *Is any Claude/Anthropic API used?* No. There's no Anthropic dependency, and `tests/unit/componentsMap.test.ts` asserts that.

## 4. How external data is retrieved
**Plain:** Four public, documented APIs (Hacker News search, GitHub issue search, Stack Exchange, DEV), each behind the same adapter interface. If one breaks, the others still work and the report says what's missing.
**Technical:** `SourceAdapter.fetch(ctx)` returns discussions plus request, failure and truncation counts. Requests have a 12 s timeout and at most 3 attempts (only network errors, 429 and 5xx are retried; `Retry-After` is honoured). GitHub runs sequentially, 6 s apart, and stops on 403/429. Stack Overflow pages through all questions and matches locally to save quota. See `lib/sources/*`, `docs/DATA_SOURCES.md`.
**Follow-ups**
- *Why not Reddit?* Its API needs OAuth credentials and has commercial terms. I didn't want to access it in a grey area. It's the first item on the next-steps list.
- *Why is GitHub "partial"?* GitHub's secondary rate limit. The adapter stops instead of hammering, keeps what it got, and the run is marked partial. Because GitHub returns only a sample (thousands of matching issues), it's excluded from week-on-week comparisons.

## 5. Normalisation and deduplication
**Plain:** Every post becomes the same record shape with its original id and URL. The same post is stored once, even if it matches five keywords or is collected again next week.
**Technical:** Primary key `(source_id, external_id)`; secondary key normalised URL (lower-case host, no www/fragment/tracking params, sorted query). Within a run, `dedupeDiscussions` merges keywords and topics. In the database, the `ingest_discussions()` SQL function upserts atomically and returns new vs duplicate counts. Running a collection twice produced 147 duplicates and 0 inflation (live run, 12 Oct).
**Follow-ups**
- *Same story on HN and DEV?* Different URLs, so they count as two discussions on two sources. That's arguably correct (two communities discussing it), and source diversity is a signal-score factor.

## 6. Controlling hallucinations
**Plain:** The model never counts and never invents links. It can only point at evidence we gave it, and code checks everything it says.
**Technical:**
1. Structured output plus Zod validation, with one repair retry.
2. Enum-constrained keys (T1, P3, D7): the model can only reference what exists.
3. Quotes must be found verbatim in the source text, or they're discarded (`isVerbatimQuote`).
4. Brief claims without valid citations are dropped (`groundBrief`).
5. Numbers in the text that weren't in the evidence pack are flagged in the report's caveats.
6. URLs are rendered from the database, never from model output.

**Follow-ups**
- *Can it still be wrong?* Yes. Relevance and "unresolved" are judgements. That's why every discussion shows the reasoning, and the PM can exclude misclassifications.
- *What was flagged in practice?* In the first live brief, the numeric check flagged a "20%" that came from developers' own words in the evidence. It was flagged for review, not removed.

## 7. Grounding recommendations
**Plain:** Every recommendation links to the pain point and the actual threads behind it. You can click from recommendation to pain point to discussion to the original post.
**Technical:** `report_evidence` rows (report, discussion, pain point, claim ref) are written when the report is generated. The pain point page shows the "evidence graph", and `/reports/:id` shows evidence chips per claim.

## 8. Trend calculations
**Plain:** We compare complete weeks only, Friday to Thursday in Indian time, and only sources collected fully for both weeks. Small numbers aren't called trends.
**Technical:** `lib/time/periods.ts` builds weeks from local calendar dates (DST-safe, half-open intervals). `lib/analytics/metrics.ts`:
- `pctChange` is null when the previous week is 0 ("New", no %).
- `insufficient_data` when there are fewer than 4 discussions across both weeks.
- `growing` / `declining` need a change of at least ±2 discussions **and** at least ±25%.
- Sources are compared like-for-like (untruncated coverage of both weeks).
- A backfill disclosure appears when previous-week data was collected late.

**Follow-ups**
- *First run, no history?* The first run looks back 3 complete weeks. These are real posts with their real publication dates, and the report discloses that they were collected retrospectively. Nothing is invented.
- *Why not compare to the last run instead of the last week?* Runs can happen any day. Calendar weeks make the comparison stable and explainable.

## 9. Supabase: configuration and history
**Plain:** Topics, keywords and sources live in database tables that Sumit edits in Settings. Each run reads them fresh, so changes apply immediately without a redeploy. Every run, discussion, analysis, report and decision is stored.
**Technical:** 12 v2 tables in four layers (configuration, ingestion, analysis, reporting) plus decisions. Unique indexes do the dedupe; a partial unique index allows one running run; an idempotency key allows one scheduled run per week. Migrations are in `supabase/migrations/`, and v2 was additive because the database is shared with the v1 branch.

## 10. Scheduled execution
**Plain:** Vercel Cron calls the weekly endpoint every Friday at 08:00 IST. It's protected by a secret, can't run twice for the same week, and every run is logged.
**Technical:** `vercel.json` `30 2 * * 5` (UTC). On Hobby, the call can arrive any time in that hour. `GET /api/cron/weekly` checks `Bearer CRON_SECRET` with a constant-time comparison. Verified in production: 401 without the secret, a 155 s successful run with it, and a second call answered "skipped".

## 11. Errors and rate limits
**Plain:** Failures are recorded and visible, not hidden. A broken source makes the run "partial", not "failed". Failed AI batches are retried in the next run, and the raw data is never lost.
**Technical:**
- Bounded retries everywhere (HTTP: 3 attempts; Gemini: 4 transient retries plus 1 repair; per-discussion analysis: 3 attempts).
- No retry loop on Gemini daily-quota errors.
- Stale "running" runs are failed after 8 minutes.
- The UI shows an actionable error, e.g. "database schema not set up yet".

## 12. Security
**Plain:** Secrets stay on the server. Reading is public; anything that writes or spends quota needs the admin passcode, and that's checked on the server every time.
**Technical:**
- HMAC-signed httpOnly cookie sessions.
- Zod-validated Server Actions; Bearer secret for cron.
- RLS on every v2 table with no anon policies; service-role key server-only.
- External text treated as untrusted (delimited prompts, escaped rendering, http(s)-only links).
- See `docs/SECURITY.md`.

**Follow-ups**
- *Why not user accounts?* A single-PM product. A passcode keeps it simple, and per-user auth is listed as a next step.
- *Prompt injection?* Discussions are wrapped as untrusted data, and the model can only fill schema fields that code validates. Even a successful injection can't run code, change queries or produce links.

## 13. Trade-offs
- Incremental analysis keeps costs low, but prompt changes aren't retroactive.
- Excluding truncated sources from week-on-week makes comparisons honest, but smaller.
- A heuristic signal score is explainable, but it isn't validated.
- One function invocation means no infrastructure to manage, but large backlogs take several runs.

## 14. Limitations and next steps
See `docs/LIMITATIONS.md`: small weekly volumes, GitHub sampling, no Reddit, model judgements, a shared admin passcode. Next: a Reddit adapter, a pain-point merge/split UI, Supabase Auth, embeddings pre-clustering, Slack delivery.

---

## The ten decisions to be able to explain

1. **Deterministic numbers, interpretive AI.** Code counts; Gemini only reads and writes.
2. **Store each discussion once** with stable ids, so re-runs never inflate counts.
3. **Complete IST weeks (Fri–Thu)** compared like-for-like, with minimum-sample rules and no % on zero baselines.
4. **Truncated sources are samples**, excluded from week-on-week comparisons but kept as evidence.
5. **Canonical pain points with semantic grouping** (Stage B + B2 merge), so recurrence is real.
6. **Grounded brief:** key-constrained citations, dropped unsupported claims, verbatim quote checks, numeric flags.
7. **Separate author text from model interpretation** in both the schema and the UI.
8. **Time-boxed, resumable pipeline** that fits Vercel's 300 s limit, with honest partial states.
9. **Idempotent scheduling:** one running run, one cron run per week, safe retries.
10. **Server-only data access + admin passcode + RLS deny-all:** the simplest secure model for a one-PM tool.
