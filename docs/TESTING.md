# Testing

| Command | What it runs | External calls? |
|---|---|---|
| `npm test` | Unit + integration tests (`tests/unit`, `tests/integration`) | **None.** HTTP is mocked with `vi.stubGlobal("fetch")`. |
| `npm run test:live` | `tests/live/*`: real Hacker News, GitHub, Stack Exchange, DEV and Gemini Flash calls. With `SUPABASE_DB_URL`/service key set, also exercises real database writes, upserts, idempotency and the run lock. | **Yes**, real APIs and the real database (test rows are prefixed and cleaned up) |
| `npm run test:e2e` | Playwright browser tests against `E2E_BASE_URL` (default `http://localhost:3000`) | The app under test |
| `npm run lint` · `npm run typecheck` · `npm run build` | ESLint, `tsc --noEmit` with generated route types, production build | — |
| `npm run check` | lint + typecheck + test + build | — |

Mocked tests prove logic and error handling. **They are not evidence that live integrations work.** That evidence comes from `test:live`, the run log at `/health`, and the stored discussions with working source links.

## Coverage map

| Area | Tests |
|---|---|
| Discussion normalisation | `tests/integration/adapters.test.ts` (HN hit → record, malformed skipped, bots skipped, signals) |
| URL + ID dedupe | `tests/unit/dedupe.test.ts`, `tests/unit/text.test.ts#normalizeUrl` |
| Keyword matching | `tests/unit/text.test.ts` (phrases, plurals, word boundaries, regex escaping) |
| Category assignment / AI output validation | `tests/unit/brief.test.ts` (schema validation, key mapping), `tests/live/gemini.live.test.ts` (real enum-constrained output, verbatim quotes) |
| Reporting-window boundaries | `tests/unit/periods.test.ts` (IST Friday boundaries, Thu 23:59 vs Fri 00:00, half-open windows, DST zone) |
| Week-on-week, zero baseline, insufficient data | `tests/unit/metrics.test.ts` |
| Like-for-like source comparison, backfill disclosure, empty DB | `tests/unit/metrics.test.ts` |
| Evidence-to-report association, dropping unsupported claims, numeric check | `tests/unit/brief.test.ts` |
| Source adapter errors: retries, 4xx no-retry, rate-limit stop, partial failure across sources | `tests/integration/adapters.test.ts` |
| Auth: session signing, expiry, tampering, passcode rotation, cron bearer | `tests/unit/auth.test.ts` |
| Components map matches code (tables, routes, cron) and no Anthropic SDK | `tests/unit/componentsMap.test.ts` |
| DB upserts, idempotent re-ingest, duplicate scheduled run, single running run, config changes | `tests/live/db.live.test.ts` |
| Dashboard, topic edit, collection trigger, source links, report view, previous reports, empty/error states, responsive layout | `tests/e2e/*.spec.ts` |

## Results

See the final section of [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md) for the latest recorded results.
