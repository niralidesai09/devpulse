# Architecture

Developer Community Pulse is a single Next.js 16 application on Vercel with a Supabase Postgres database, Gemini Flash for every AI task, and four public data sources. There are no extra services, queues or workers. The scheduler is Vercel Cron, and longer work runs inside one function invocation with a time budget.

See [COMPONENTS_MAP.md](COMPONENTS_MAP.md) for the diagram.

## Why this shape

| Decision | Why | Trade-off |
|---|---|---|
| One Next.js app (UI + API + pipeline) | Simplest thing that deploys reliably on Vercel; one codebase to defend in a viva | Long jobs must fit the 300 s function limit → time-boxed, resumable pipeline |
| Supabase Postgres | Required by the brief; relational integrity, unique constraints for dedupe, SQL function for atomic upserts | Service-role key must stay server-side |
| Server-only data access | No RLS policy design for browser roles, no key exposure; pages are server-rendered | Every read goes through the server (fine at this scale) |
| Gemini Flash, structured JSON | Required; cheap and fast enough to classify hundreds of posts per run | Needs validation and grounding (done in code) |
| Deterministic metrics in code | Counts and percentages must be exact and reproducible; LLMs are bad at arithmetic | Model only interprets |
| Incremental analysis | Each discussion is analysed once; weekly cost ≈ new discussions only | Changing the prompt does not re-analyse history automatically (reset + rerun needed) |

## Pipeline (one run)

`lib/pipeline/run.ts` — stages and their failure behaviour:

1. **Load config** (`getActiveConfig`): active, non-archived topics with active keywords; enabled sources. Snapshot stored on the run. *Fails the run* if nothing is active.
2. **Collect** (`runCollection`): all enabled adapters in parallel over the lookback window (default: the last 3 complete reporting weeks + the current partial week). *A failing source never fails the run*; the run fails only if **every** source fails.
3. **Normalise + dedupe** (`dedupeDiscussions`): primary key `(source, external id)`, secondary key normalised URL; keywords/topics merged so a post matching several keywords counts once.
4. **Ingest** (`ingest_discussions()` SQL function): inserts new discussions; for known ones refreshes engagement, `last_retrieved_at` and merges keywords. Returns new vs duplicate counts per source. Idempotent.
5. **Analyse** (`runAnalysis`, Gemini Stage A): up to `MAX_ANALYZE_PER_RUN` pending/failed discussions, newest first, 20 per call, 3 calls in parallel. Stops starting new batches when the time budget runs low; the rest stay `pending`. Failed batches increment `analysis_attempts` (max 3) and keep raw data.
6. **Consolidate** (Gemini Stage B): new pain-point proposals are mapped to existing pain points or merged into new canonical ones. Validated; falls back to exact-title grouping. **Stage B2** then reviews all active pain points and merges near-duplicates across runs (`merged_into`; discussions reassigned; old links redirect).
7. **Metrics** (`computeReportMetrics`, code only).
8. **Brief** (Gemini Stage C): evidence pack → schema-validated JSON → grounding (key mapping, dropping unsupported claims, numeric check).
9. **Store + deliver**: report + snapshot + evidence rows; Resend email if configured.

Run status: `succeeded` (everything worked), `partial` (data stored but a source, batch or the report degraded — details in `stats.warnings`), `failed` (nothing usable; error recorded).

### Time budget

`FUNCTION_MAX_SECONDS = 300` (Vercel Hobby with Fluid compute). The run uses 285 s, keeps 75 s in reserve for the brief, and skips the brief (recording why) if fewer than 45 s remain. "Generate brief" (`POST /api/reports`) rebuilds the report from stored data at any time. A run left in `running` for over 8 minutes (killed by the platform) is marked `failed` automatically before the next run starts.

### Concurrency and idempotency

- `collection_runs_one_running`: a partial unique index allowing only one `running` row → atomic "one run at a time".
- `collection_runs.idempotency_key` (unique) = `cron:<period end>` for scheduled runs → duplicate cron deliveries for the same week are rejected (HTTP 200 "skipped").
- Ingest is an upsert keyed on `(source_id, external_id)`; analysis is keyed on `discussion_id`; report snapshot on `(report_id, pain_point_id)`.

## Reporting windows

- Timezone: `REPORT_TIMEZONE` (default **Asia/Kolkata**, UTC+05:30). All timestamps are stored in UTC.
- A reporting week = 7 local calendar days, **Friday 00:00 → next Friday 00:00 local**, half-open `[start, end)`.
- The brief delivered on Friday morning reports the **latest complete week** (Fri–Thu just ended) and compares it with the **immediately preceding** week.
- The in-progress week appears only in the volume chart, hatched and labelled "partial". It is never compared with a full week.
- Implemented in `lib/time/periods.ts` using local calendar dates (correct for DST zones too), tested in `tests/unit/periods.test.ts`.

## Week-on-week rules (`lib/analytics/metrics.ts`)

- **Like-for-like sources:** a source counts in comparisons only if a successful (or partial) and **untruncated** collection window fully covered **both** weeks. A truncated source returned only a sample, so its counts are not comparable. Others are listed under "excluded from comparison" with the reason.
- `pctChange = round((current − previous) / previous × 100)`, **null when previous = 0** (shown as "New", no percentage).
- **Trend labels:** `new` (0 → n), `gone` (n → 0), `insufficient_data` (fewer than 4 discussions across both weeks), `growing` (≥ +2 and ≥ +25%), `declining` (≤ −2 and ≤ −25%), else `stable`.
- **Backfill disclosure:** if most previous-week discussions were first retrieved after that week ended, the report says the comparison relies on retrospective collection.
- Excluded discussions (PM curation) never count. Pending/failed analyses are reported as a caveat.

## Signal score (heuristic, documented, not validated)

`score = 100 × (0.30·volume + 0.20·recurrence + 0.15·diversity + 0.15·unresolved + 0.10·growth + 0.10·dissatisfaction)`

| Component | Definition (0..1) |
|---|---|
| volume | `ln(1+current) / ln(1+max current)` |
| recurrence | weeks present / 4 |
| diversity | distinct sources (current+previous) / 3, capped |
| unresolved | unresolved / current |
| growth | `((current − previous) / max(previous, 2) + 1) / 2`, clamped (0.5 = flat) |
| dissatisfaction | discussions criticising an existing tool / current |

Engagement (points/comments) is deliberately **not** in the score, so a viral but irrelevant thread cannot top the list.

## AI design (Gemini Flash only)

| Stage | Input | Output (Zod schema) | Code-side checks |
|---|---|---|---|
| A · analyse | ≤ 20 delimited discussions (≤ 900 chars each), topics (T-keys), existing pain points (P-keys) | relevance + reason, topic, pain point or NEW + title, paraphrase, verbatim quote, unresolved + evidence, workaround, tools, dissatisfaction, frustration, severity | enum keys only; quotes must appear verbatim in the source or are discarded; missing ids retried |
| B · consolidate | new proposals (N-keys) + existing pain points | groups → existing P-key or NEW canonical title | every N exactly once; leftovers keep their own title |
| C · brief | evidence pack: pain points with code-computed numbers (P-keys), discussions (D-keys), data caveats | headline, summary, changes, insights, opportunities, recommendations, questions, caveats — each citing keys | unknown keys removed; uncited claims dropped; numbers not in the pack flagged |

Every call: JSON schema output, Zod validation, one **repair** retry showing the validation error, transient-error backoff (429/5xx/timeouts, max 4, honours `retryDelay`), 120 s timeout, 200 k-char prompt cap. Daily-quota 429s are not retried in a loop. The model id is stored on every analysis row and report, along with prompt and pipeline versions.

**Prompt injection:** external text sits inside `<discussion>` delimiters (closing tags neutralised), the system prompt declares it untrusted, the model never sees URLs or secrets, and its output cannot do anything except fill schema fields that code validates.

## Data model

See `supabase/migrations/0005_v2_intelligence_schema.sql` (commented). Layers:

- configuration: `topics`, `topic_keywords` (globally unique normalised keyword), `sources`
- ingestion: `collection_runs`, `source_runs`, `discussions` (unique `(source_id, external_id)` and `url_normalized`)
- analysis: `discussion_analysis` (1:1 with discussion), `pain_points`
- reporting: `reports` (metrics + brief JSON, model/prompt/pipeline versions, email status), `report_pain_points` (snapshot), `report_evidence`
- decisions: `pain_point_decisions` (append-only)

The v1 tables (`runs`, `posts`, `topic_stats`, `briefs`, `suggested_topics`) remain untouched because the same database is shared with the v1 branch.
