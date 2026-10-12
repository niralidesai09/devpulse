# Submission checklist and readiness scorecard

_Last verified: 12 Oct 2026 (IST), against production https://devpulse-v2-delta.vercel.app_

## Deliverables

| Deliverable | Where | Status |
|---|---|---|
| Public Vercel URL | https://devpulse-v2-delta.vercel.app | ✅ live, public, verified |
| GitHub repository | https://github.com/niralidesai09/devpulse (branch `main`) | ✅ |
| Components Map | [docs/COMPONENTS_MAP.md](COMPONENTS_MAP.md) and https://devpulse-v2-delta.vercel.app/architecture | ✅ test-checked against code |
| Demo video (≤ 5 min) | record using [DEMO_SCRIPT.md](DEMO_SCRIPT.md) | ⏳ **you record it** |
| Docs | README, ARCHITECTURE, DATA_SOURCES, API, SECURITY, TESTING, DEPLOYMENT, LIMITATIONS, VIVA_GUIDE | ✅ |

## Mandatory acceptance criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Starts locally | PASS | `npm run dev`; full local run 12 Oct, 147 discussions, 184 s |
| 2 | Production build succeeds | PASS | `npm run check`: lint, typecheck, 105 tests, `next build` |
| 3 | Public Vercel URL loads | PASS | all 11 pages return 200 anonymously; Playwright suite against production |
| 4 | All AI tasks use Gemini Flash | PASS | `lib/ai/gemini.ts` is the only model client; `getModel()` rejects non-Flash ids; `/api/health` → `gemini-3.8-flash` |
| 5 | No Claude API in the shipped app | PASS | no Anthropic dependency; asserted in `tests/unit/componentsMap.test.ts` |
| 6 | At least one real source end to end | PASS | Hacker News: 115 discussions stored, analysed, cited in briefs |
| 7 | Second source works | PASS | GitHub 261, DEV 78, Stack Overflow 1 (`/health`) |
| 8 | Traceable original URLs | PASS | every discussion stores its URL; e2e checks that a link resolves to news.ycombinator.com, github.com, stackoverflow.com or dev.to |
| 9 | Deduplication works | PASS | second production run: 147 already stored, 0 inflation; `tests/live/db.live.test.ts`; unit tests |
| 10 | Categories/keywords in Supabase | PASS | `topics`, `topic_keywords`; 8 topics / 58 keywords |
| 11 | Config changes apply without redeploy | PASS | config read fresh per run (`getActiveConfig`); live test; e2e create/edit/delete |
| 12 | AI classifications validated and stored | PASS | Zod-validated JSON; `discussion_analysis` (model, prompt version); verbatim-quote check |
| 13 | Counts from real records | PASS | `computeReportMetrics` over stored rows; unit tests |
| 14 | Correct reporting windows | PASS | IST Fri–Thu weeks; `tests/unit/periods.test.ts` boundary tests |
| 15 | Insufficient history handled honestly | PASS | zero-baseline → "New" with no %; < 4 → "Too few to call"; like-for-like + backfill disclosure shown on the dashboard |
| 16 | Brief persisted | PASS | `reports` (3 succeeded), `report_pain_points`, `report_evidence` (147 links) |
| 17 | Recommendations link to evidence | PASS | uncited items dropped by `groundBrief`; evidence chips; evidence graph |
| 18 | Manual collection flow | PASS | production `POST /api/runs` → 202 → background run completed (253 new discussions); UI button polls the same API |
| 19 | Scheduled execution configured, limitations documented | PASS | `vercel crons ls`: `/api/cron/weekly 30 2 * * 5`; production cron call: 401 without secret, 200 with it, duplicate → skipped. *The first real Friday trigger (16 Oct, 08:00–08:59 IST) is still to happen; check `/health` afterwards.* |
| 20 | Errors and partial failures handled | PASS | GitHub secondary limit → run `partial`, other sources kept; report skipped honestly when out of time |
| 21 | No secrets in the browser | PASS | server-only env vars; staged-file secret scan before every commit; `/api/health` returns booleans only (e2e) |
| 22 | Tests, lint, typecheck, build run | PASS | see the results section below |
| 23 | Responsive; loading/empty/error states | PASS | e2e: no horizontal scroll on any page (Pixel 7 + desktop); skeletons; empty states; schema-missing error state verified |
| 24 | Components Map matches code | PASS | unit test: every table and route on the map exists; doc equals rendered source |
| 25 | README and setup docs | PASS | README, `.env.example`, DEPLOYMENT, `SETUP_V2.sql` |
| 26 | Demo script and viva guide | PASS | `docs/DEMO_SCRIPT.md`, `docs/VIVA_GUIDE.md` |
| 27 | GitHub repo ready | PASS | `main` pushed; no secrets committed |
| 28 | Submission URLs verified | PASS for Vercel, GitHub and Components Map · **BLOCKED for the demo video** (recorded by you) |

## Test results (12 Oct 2026)

| Command | Result |
|---|---|
| `npm run lint` | 0 errors, 0 warnings |
| `npm run typecheck` | pass |
| `npm test` | **105 passed** (unit + integration, mocked providers) |
| `npm run test:live` sources | HN, Stack Overflow, DEV succeeded; GitHub partial (rate limit), reported honestly |
| `npm run test:live` Gemini | pass: 12 real discussions analysed, quotes verified, consolidation |
| `npm run test:live` database | **5 passed**: idempotent ingest, URL duplicate, one running run, duplicate cron, config changes |
| `npm run test:e2e` (production) | **all passed** on desktop + mobile (the real-collection trigger test is opt-in via `E2E_TRIGGER_RUN=1`) |
| `npm run build` | pass |

## Submission-day checklist

- [ ] Open https://devpulse-v2-delta.vercel.app/api/health: `database.ok: true`, `gemini.model` contains `flash`.
- [ ] Open `/health`: the latest run is succeeded or partial. If the Friday cron ran, confirm it appears with trigger `cron`.
- [ ] Open `/` in a private window: numbers present, brief present, evidence chips open the original posts.
- [ ] If needed, sign in at `/login` and press **Run collection now** (2–4 min), then check `/reports`.
- [ ] Record the demo (≤ 5 min) with `docs/DEMO_SCRIPT.md`; don't show `.env.local` or the Vercel env page.
- [ ] Submit: Vercel URL, GitHub URL, Components Map link (`docs/COMPONENTS_MAP.md` on GitHub or `/architecture`), demo video.
- [ ] Give evaluators the admin passcode **only if** the submission form asks for it (it is in your `.env.local`; rotate it afterwards on Vercel).
