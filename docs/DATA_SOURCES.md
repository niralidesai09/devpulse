# Data sources

All four sources are public, documented APIs called from the server. Nothing is scraped, and no access control is bypassed. Every adapter implements `SourceAdapter.fetch(ctx)` (`lib/sources/types.ts`) and returns its requests, failed requests, truncation flag, malformed-record count and errors. `runAdapter` turns these into `succeeded` / `partial` / `failed`.

Shared behaviour (`lib/sources/utils.ts`):

- 12 s timeout per request
- at most 3 attempts, retrying only network errors, timeouts, 429 and 5xx
- honours `Retry-After` (capped at 15 s)
- no retry on other 4xx errors
- an identifying User-Agent

| Source | Endpoint | Auth | Query strategy | Limits we respect | Dedupe id | "Unresolved" signal |
|---|---|---|---|---|---|---|
| **Hacker News** | `hn.algolia.com/api/v1/search_by_date` | none | one request per keyword, stories + comments, `created_at_i` window, up to 1000 hits (Algolia max) | Algolia public API; concurrency 4 | `objectID` | text only |
| **GitHub Issues** | `api.github.com/search/issues` | `GITHUB_TOKEN` (no scopes) | per topic: up to 6 keywords OR-ed (GitHub max 5 ORs), `in:title is:issue comments:>=1 created:<window>`, 1 page of 100, bot authors filtered in code | 30 search req/min + secondary limits → sequential, 6 s apart, **stop on 403/429** (status partial) | issue `id` | open / closed |
| **Stack Overflow** | `api.stackexchange.com/2.3/search/advanced` | optional `STACKEXCHANGE_KEY` | page all questions in the window (≤ 12 pages) and match locally (saves quota) | 300 req/day/IP keyless; obeys `backoff`; stops when quota < 10 | `question_id` | accepted answer |
| **DEV Community** | `dev.to/api/articles/latest?tag=` | none | 9 relevant tags (`ai` dropped: too broad), pages of 1000, ≤ 3 pages until older than the window; match title + description | concurrency 3 | article `id` | text only |

## Why GitHub is a *sample*, not a census

Code-review and CI keywords appear in thousands of GitHub issue titles per week, most of them auto-filed tracker tickets ("Flaky test: X"). On 12 Oct 2026, `"flaky tests" in:title` matched 1,435 issues in three weeks, and still 3,254 for the broader topic query with `comments:>=1`. Paging through that trips GitHub's secondary rate limit. GitHub therefore contributes the 100 newest **discussed** issues per topic query. Its runs are flagged `truncated`, which keeps GitHub out of week-on-week comparisons, but its discussions still count as evidence and in volume.

## Matching

A record is kept only if a configured keyword appears as a **phrase** in its text, checked locally with `containsPhrase`. The match is case-insensitive, whitespace-tolerant, word-bounded, and allows a plural "s". Search APIs match loosely, and this local check stops "contest retry" from matching "test retry". All matched keywords are stored. GitHub matches on titles only, which keeps it consistent with its `in:title` query.

## Why not Reddit?

Reddit's Data API requires OAuth app registration and has commercial-use terms. Unauthenticated JSON access is restricted. It could be added with credentials as a fifth adapter, but it was left out rather than accessed in a grey area. See [LIMITATIONS.md](LIMITATIONS.md).

## Normalised record (`CollectedDiscussion`)

`sourceId, externalId, url, title, excerpt (verbatim, ≤ 600 chars around the keyword), author, score, commentCount, publishedAt (UTC), matchedKeywords[], topicIds[], signals {kind, isOpen, isAnswered, hasAcceptedAnswer, repo, parentTitle}`.

Records missing an id, URL or date are counted as `skippedMalformed` and dropped. Publication time and retrieval time are stored separately (`published_at`, `first_retrieved_at`, `last_retrieved_at`).

## Measured behaviour (11 Oct 2026, live)

Measured with `npm run test:live`, 14-day window, 9 sample keywords:

- Hacker News: succeeded, 121 matches.
- DEV: succeeded, 87 matches (truncated: one tag had more than 3 pages).
- Stack Overflow: succeeded, 1 match. Stack Overflow's new-question volume is low.
- GitHub: partial, 148 matches before a secondary rate limit stopped the third request; reported as partial.
