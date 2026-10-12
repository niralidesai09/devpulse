# Groundswell: data integrity and provenance audit

Audit date: 12 Oct 2026 · Branch `roadmap` · Audited run `ed3b0e66-2c00-4e74-b0e3-681b929239cf` (12 Oct 2026, 21:12 IST, scheduled pipeline, status **success**).
Production confirmation: after deploying the audited code, production run `b4e2841a-ac94-41cc-8a7d-9f71bf06ee0c` (cron path) finished **success** in 84 s with all four sources `ok`, 232 collected, 76 relevant, 34 duplicates merged, 0 invalid links, brief with 34 evidence links / 0 unknown ids / 0 unverified numbers, email sent; provenance **PASS 16 · WARN 3 · FAIL 0**.
Re-run the provenance check at any time: `npm run verify:provenance -- 8`. Unit tests: `npm test`.

## A. Source-by-source verification

| Source | Retrieval mechanism | Records retrieved (before dedupe) | Records persisted (relevant) | Source links verified | Status | Evidence |
|---|---|---:|---:|---|---|---|
| Hacker News | Algolia `search_by_date`, exact phrase per keyword (stories + comments), up to 5 pages × 100; no auth | 23 | 7 | 7 / 8 PASS on id, title, time, URL; 2 WARN (parent story retitled by HN after collection); all URLs open (200) | **PASS** | `verify-provenance` output; official HN API (`hacker-news.firebaseio.com`) confirms the retitles |
| GitHub Issues | Search API `/search/issues`, keywords OR-grouped (≤ 6 per query), exact window timestamp, newest 100 per query; `GITHUB_TOKEN` | 216 | 49 | 8 / 8 PASS (id, title, time, `html_url`, opens 200) | **PASS (limited coverage)** | 12 coverage notes: every query had more matches than its 100-result page; persisted issues span 10–12 Oct only |
| Stack Overflow | Stack Exchange API `/search/advanced`, all questions of the window (≤ 5 pages × 100), matched locally; optional key | 1 | 1 | API confirms id, title, time, link; public page returns 403 to scripts (Cloudflare check) | **PASS (low volume)** | Only 1 matching question this week; page needs a human visit to view |
| DEV.to | Forem API `/articles/latest`, 10 tags × newest 1,000, matched locally; no auth | 32 | 20 | 8 / 8 PASS (id, title, time, URL, opens 200) | **PASS (limited coverage)** | 3 coverage notes, e.g. `#ai`: 1,000 newest articles cover only the last 17 h |
| Reddit | Not integrated | – | – | – | **BLOCKED** | No adapter, env var or record; DB constraint allows only the 4 sources (see H) |

All four integrations returned real records, every request succeeded (0 failed requests), and the scheduled job and the "Run now" button call the same `runPipeline()`.

## B. Records flow: source → database → dashboard

1. **Retrieval**: each adapter maps the API response to one `SourcePost` (`source`, `externalId`, URL from the API, original title, verbatim excerpt, `postedAt` from the API, `retrievedAt` = fetch time).
2. **Cleaning** (`lib/sources/index.ts`): links must be `https://` on the post's own site, otherwise the record is dropped; duplicates are merged by `source + id` and by canonical URL. Audited run: 237 kept after 35 duplicates were merged and 0 invalid links found.
3. **Persistence** (`toPostRow`): `posts` stores source fields, provenance (`run_id`, `retrieved_at`, `matched_keyword`) and the AI interpretation in **separate columns** (documented with `COMMENT ON COLUMN`).
4. **Display**: dashboard counts are read from `topic_stats`, which reconciles exactly with `posts` (verified per topic; e.g. Branch Protection 15 = 15 rows).
5. **Independent check**: 24 sampled records re-fetched from the official APIs. Result: **PASS 21 · WARN 3 · FAIL 0**.

## C. Problems found (and what was done)

| Finding | Impact | Fix |
|---|---|---|
| 2 runs marked **success** although a source had failed requests (11 Oct: 3/10 DEV.to timeouts; 12 Oct: 1/14 GitHub 403) | Green status hid incomplete data | Sources now report `ok / partial / failed`; any non-ok source makes the run `partial`. Both runs corrected to `partial` in the database (with an audit note). |
| **Silent truncation**: HN read 100 loose results per keyword (e.g. "code review" had 338) | Missed matches, no record of it | Exact-phrase search + pagination (≤ 500); coverage notes when limits are hit |
| GitHub newest-100 cap and DEV.to 1,000-article cap | Coverage of the week is partial for these sources | Not hidden any more: recorded per run, shown on `/runs` and in the brief's "About this data" |
| GitHub window used a date (`created:>=YYYY-MM-DD`) | Could include up to 24 h before the window | Exact timestamp + local check |
| DEV.to 1,000-article requests timing out at 10 s | Caused one partial run | 25 s timeout for this endpoint |
| HN comment titles: 2 of 7 sampled show the parent story's **old** title | Stored label "Comment on: …" lags an HN moderator retitle | Documented as a known limitation; comment id, time and URL are correct |
| No fabricated, duplicated or misattributed records were found | – | 0 duplicate ids or URLs per run; 0 missing ids, timestamps or links; 0 records outside the window |

## D. Metric definitions (and the inconsistency fixed)

**Problem:** the dashboard showed "Mentions" (all four sources) next to "Trend" (Hacker News only), so an HN-only change looked like a change in overall mentions. Small samples (e.g. 0 → 2) were labelled "new" and could become the "Fastest riser".

| Metric | What it measures | Sources | Records counted | Period | Duplicates | Comparison |
|---|---|---|---|---|---|---|
| **Mentions (all sources)** | Relevant posts per topic | HN, GitHub Issues, Stack Overflow, DEV.to | Posts the AI judged relevant and assigned to the topic | Rolling 7 days before the run | Merged by source id + canonical URL; each post counts once | vs the previous weekly run (window ending 6–8 days earlier) **only if every source was complete in both runs**; otherwise "not comparable". No such run exists yet. |
| **Hacker News keyword matches** | Distinct HN stories/comments containing any topic keyword (exact phrase) | Hacker News only | All matches, before AI filtering | This week (days 0–7) vs last week (days 8–14), equal windows | Distinct HN ids | Shown as "last → this (change)". Fewer than 5 in total → **"too few to compare"** (no % and no direction). Last week 0 and ≥ 5 now → **"new in HN data"** (newly observed in collected data, not proof it is new in the market). |
| **Unresolved** | Share of a topic's mentions with no working fix | Same as mentions | AI judgement using source signals (open issue, no accepted answer) | Same as mentions | Same as mentions | – |
| **Opportunity Score** | **Relative** ranking of this week's topics, 0–100 | Same as mentions | frequency × growth × unresolved × severity ÷ 5, components rounded to 4 dp before multiplying | This run | – | Growth uses the previous comparable run, else the HN trend if it has enough data, else **×1 (neutral)**. Top topic = 100; it is not an absolute measure of market opportunity. |
| **Fastest rising (Hacker News)** | Topic with the largest HN keyword increase | Hacker News only | Only "up" or "new" trends (both need ≥ 5 matches) | Same as HN matches | – | Shows "None with enough data" when no topic qualifies (the case this week). |

No metric can produce NaN or Infinity (tested for every pair of counts from 0 to 12).

## E. Copy and proofreading changes

- Labels: "Mentions" → "Mentions (all sources)"; "Trend" → "Hacker News keyword matches" with counts (e.g. "16 → 10 (▼ 37%)"); "Fastest riser" → "Fastest rising (Hacker News)"; "score" → "relative score"; "Opportunity score" → "Opportunity Score".
- Brief: table columns renamed to match; "Rising & falling" → "Rising and falling"; "Unresolved / underserved problems" → "Unresolved and underserved problems"; section 8 labelled **Recommendations**; objection responses labelled as suggestions; new code-generated **About this data** section (sources queried, failures, coverage limits, cleaning, relevance, small samples).
- Source names standardised: "GitHub" → "GitHub Issues" everywhere; "Hacker News", "Stack Overflow", "DEV.to".
- Times: "7:06 pm IST" → "7:06 PM IST" (matches "8:00 AM IST" elsewhere).
- Validation messages: full sentences with limits (e.g. "Name must be at least 2 characters.").
- Removed an unsupported claim: "Everything relevant fitted a monitored topic" → "No new topic suggestions this week."
- Run history explains that a partly failed source makes the run partial; sources show ✓ complete / ◐ partial / ✕ failed, plus coverage notes.
- Original source titles and excerpts were not edited.

## F. Where AI model information is visible

- **Visible:** only on **How it works** (`/architecture`): intro, legend "AI step (Gemini Flash)", the "Gemini Flash only" rule card with the model id, and the Components Map.
- **Dashboard and brief:** "AI-assisted" labels only; the footer links to How it works. The brief no longer names the model.
- **Stored for audit:** `briefs.model`, `runs.stats.model`.

## G. Tests

`npm test` (Vitest, no network): **31 tests, 31 passed**, covering normalisation, dedupe, attribution, report-to-evidence links, cross-source counts, week-on-week maths, zero baselines, AI schema validation, invalid URLs and failed or partial runs. A mutation check (re-introducing the "partial counted as ok" bug) made the relevant test fail. `npm run lint`, `tsc --noEmit` and `npm run build`: clean.

## H. Reddit

Not integrated, and the app does not claim it. Authorised access requires a Reddit OAuth app (client id + secret registered under the owner's account) and compliance with Reddit's Data API terms and rate limits. No credentials are available, so it is **BLOCKED**; the four working sources were left untouched.

## I. Deployment

Live: **https://devpulse-sable-seven.vercel.app** (Vercel production, branch `roadmap`, commit `d1adb0d`). All pages return 200; the dashboard shows the new metric labels and no model name.

## J. Not independently verifiable

- AI judgements (relevance, unresolved, severity, sentiment, competitors, pain-point wording) are interpretations, not facts. They are schema-validated, cite their evidence and are labelled AI-assisted, but their correctness is a judgement call.
- Stack Overflow's public page could not be opened by a script (Cloudflare); its id, title, time and link were verified through the official API.
- Coverage: GitHub Issues (newest 100 per query; this run spans 10–12 Oct) and DEV.to (busy tags reach only part of the week) do not cover the full 7 days. Mentions are a sample of these sources, not a census.
- Only Hacker News supports an equal-window week-on-week comparison today; the all-source comparison becomes available after the next weekly run.
