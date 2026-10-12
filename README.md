# Developer Community Pulse

**Live:** https://devpulse-v2-delta.vercel.app · **Repo:** https://github.com/niralidesai09/devpulse · **Components map:** [docs/COMPONENTS_MAP.md](docs/COMPONENTS_MAP.md) (also rendered at `/architecture`)

Developer Community Pulse is an evidence-backed intelligence product for **Sumit**, the only PM at a 15-person startup that builds a code review automation tool. It replaces his 90-minute Friday search through developer communities. Every week it:

1. **collects** current discussions from Hacker News, GitHub Issues, Stack Overflow and DEV, using the topics and keywords stored in Supabase;
2. **deduplicates and stores** them with stable source ids, original URLs, publication time and retrieval time;
3. **analyses** each new discussion with **Gemini Flash**: relevance, topic, pain point, unresolved status, workaround, tools mentioned, plus a quote checked verbatim against the source;
4. **groups** different wordings of the same problem into canonical pain points;
5. **computes in code** the counts, the week-on-week change between complete IST reporting weeks (Fri–Thu), trend labels with minimum-sample rules, and a transparent signal score;
6. **writes a brief** with Gemini Flash in which every claim must cite stored discussions. Unsupported claims are dropped; numbers the model did not receive are flagged.
7. **stores** the report as an immutable snapshot, **emails** it (Resend, optional), and shows everything in the dashboard.

It runs automatically every **Friday 08:00 IST** (Vercel Cron) and on demand with **Run collection now**.

## What you can do in the app

| Page | Purpose |
|---|---|
| `/` Overview | This week vs last week, top pain points, growing/new/fading, unresolved problems, AI recommendations with evidence chips, volume and topic charts, source coverage |
| `/pain-points` and `/pain-points/:id` | Every pain point with counts, trend, 4-week sparkline, signal score; the detail page has the AI analysis, workarounds, tools named, the evidence graph and a **decision workspace** |
| `/opportunities` | Underserved-opportunity hypotheses: observed facts vs hypothesis, interview question, experiment, success criterion, confidence and limitations |
| `/discussions` and `/discussions/:id` | Source explorer: search, filter (source, topic, pain point, status, dates), sort, open the original, see the author's words next to the model's reasoning, exclude noise |
| `/reports`, `/reports/:id`, `/reports/compare` | Saved weekly briefs (10 sections), print/PDF, Markdown/JSON export, and comparison of two saved reports |
| `/decisions` | PM decision log (investigate / validate / backlog / monitor / dismiss) |
| `/health` | Run log, per-source status, new vs duplicate counts, truncation, analysis backlog, failures, retry |
| `/settings` | Create, edit, pause, archive and delete topics; add, edit, pause and remove keywords; enable or disable sources. Stored in Supabase and used by the next run with no redeploy |
| `/architecture` | Components map, pipeline stages, security boundaries |

Reading is public. Editing, runs and decisions need the admin passcode (`/login`).

## Setup (fresh checkout)

```bash
git clone https://github.com/niralidesai09/devpulse && cd devpulse
npm install
cp .env.example .env.local   # fill in the values; see table below
npm run db:migrate           # needs SUPABASE_DB_URL; or paste supabase/SETUP_V2.sql into the Supabase SQL editor
npm run dev                  # http://localhost:3000
```

Then sign in at `/login` with `ADMIN_PASSCODE` and press **Run collection now**. The first run backfills the last three complete weeks.

### Environment variables

| Name | Required? | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | yes, server only | Supabase → Project Settings → API keys → **secret** key (`sb_secret_…`) |
| `GEMINI_API_KEY` | yes | https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | yes | A Gemini **Flash** model id (currently `gemini-3.8-flash`). Non-Flash ids are refused. |
| `GITHUB_TOKEN` | yes, for GitHub | GitHub → Settings → Developer settings → fine-grained token, no permissions |
| `CRON_SECRET` | yes | `openssl rand -hex 32`. Vercel sends it to the cron route. |
| `ADMIN_PASSCODE` | yes, for editing | Any long random string |
| `RESEND_API_KEY`, `BRIEF_TO_EMAIL` | optional | https://resend.com/api-keys. Without them, briefs are in-app only. |
| `BRIEF_FROM_EMAIL` | optional | A verified Resend sender |
| `STACKEXCHANGE_KEY` | optional | https://stackapps.com/apps/oauth/register (raises the quota) |
| `REPORT_TIMEZONE`, `REPORT_WEEK_END_DAY`, `LOOKBACK_WEEKS`, `MAX_ANALYZE_PER_RUN`, `APP_URL` | optional | See `.env.example` for defaults |
| `SUPABASE_DB_URL` | local only | Supabase → Connect → Session pooler URI (for `npm run db:migrate`) |

## Commands

| Command | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript with generated route types |
| `npm test` | 100+ unit and integration tests (no network; providers mocked) |
| `npm run test:live` | Real API, Gemini and database tests |
| `npm run test:e2e` | Playwright against `E2E_BASE_URL` |
| `npm run check` | lint + typecheck + test + build |
| `npm run db:migrate` / `db:status` | Apply or list SQL migrations |

## How the weekly schedule works

`vercel.json` schedules `GET /api/cron/weekly` at `30 2 * * 5` UTC, which is **Friday 08:00 IST**. On the Hobby plan the call can arrive at any point within that hour. The route checks `Authorization: Bearer CRON_SECRET`. A second delivery for the same week is skipped (idempotency key), and only one run can be active at a time. The run collects, analyses, writes the brief, stores it, and emails it if Resend is configured. Every outcome is logged at `/health`. Details: [docs/API.md](docs/API.md).

## Deployment

The app is deployed on Vercel (project `devpulse-v2`). See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md): pipeline, reporting windows, week-on-week rules, signal score, AI design
- [Components map](docs/COMPONENTS_MAP.md)
- [Data sources](docs/DATA_SOURCES.md)
- [API and scheduled job](docs/API.md)
- [Security model](docs/SECURITY.md)
- [Testing](docs/TESTING.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Known limitations](docs/LIMITATIONS.md)
- [Demo script](docs/DEMO_SCRIPT.md) · [Viva guide](docs/VIVA_GUIDE.md) · [Submission checklist](docs/SUBMISSION_CHECKLIST.md)

## Hard constraints this project respects

- Every AI task uses **Gemini Flash** via `@google/genai`. No Anthropic/Claude API is used anywhere in the app; a unit test checks the dependency list.
- Live data only; mocks exist only inside the test suites.
- Topics and keywords live in Supabase and can be edited in the app.
- Secrets live only in server env vars; `.env*` is git-ignored.
