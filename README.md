# Groundswell

**Catch developer pain before it peaks.**

Groundswell is an AI-powered weekly developer-community intelligence digest. It is built for Sumit, the sole PM at a 15-person
startup making a code review automation tool. Every **Friday at 8:00 AM IST** it reads what developers said in the last 7 days on
Hacker News, Stack Overflow, GitHub Issues and DEV.to, and emails Sumit a brief that answers three questions:

1. **Which pain points are surfacing most often** this week (with mention counts)?
2. **Is each one trending up or down** compared with last week (% change)?
3. **Which problems are unresolved or underserved** by existing tools?

Every claim in the brief links to the real thread it came from.

- **Live app:** https://devpulse-sable-seven.vercel.app
- **How it works (diagram + Components Map):** https://devpulse-sable-seven.vercel.app/architecture · [docs/COMPONENTS_MAP.md](docs/COMPONENTS_MAP.md)
- **Viva prep + demo script:** [VIVA.md](VIVA.md)

## What it does

| Feature | Where |
|---|---|
| Friday brief (8 sections: TL;DR, top pain points table, rising & falling, unresolved problems, emerging topics, competitor radar, sales objections, 3 things for Monday sprint planning), emailed with Resend | Email + `/` |
| Opportunity Score 0–100 per topic, with a **"Why this score?"** breakdown and the top 3 evidence threads | `/` |
| Week-over-week chart of Hacker News keyword matches (clearly labelled as Hacker News only) | `/` |
| **Emerging Topic Radar**: Gemini suggests new topics; approve with one click and they're monitored next week | `/` |
| **Competitor & Objection Radar**: tool mentions + sentiment, likely sales objections with honest responses | `/` |
| **Ask the Pulse**: ask a question, get an answer only from collected posts, with links | `/#ask` |
| Add / edit / pause topics and keywords without code changes | `/topics` |
| Run history with per-source status; protected **Run now** button for live demos | `/runs`, `/` |

## What the numbers mean

| Metric | Meaning |
|---|---|
| **Mentions (all sources)** | Relevant posts per topic in the last 7 days across Hacker News, GitHub Issues, Stack Overflow and DEV.to, each discussion counted once. |
| **Hacker News keyword matches** | Exact-phrase keyword matches on Hacker News only, last week → this week. Fewer than 5 in total is shown as "too few to compare". |
| **vs previous run** | Mentions compared with the previous weekly run, only when every source was complete in both runs (available from the second weekly run). |
| **Opportunity Score** | A relative ranking (0–100) of this week's topics: frequency × growth × unresolved share × severity, with the top topic = 100. Not an absolute measure of market size. |

Coverage is limited to what the four APIs return: GitHub Issues reads the newest 100 issues per search and DEV.to the newest 1,000
articles per tag, so busy weeks are sampled rather than fully covered. Each run records these limits ("coverage notes") on `/runs`
and in the brief. Full details: [docs/DATA_AUDIT.md](docs/DATA_AUDIT.md).

## Tech stack

Next.js 16 (App Router, TypeScript) · Tailwind CSS v4 · Supabase (Postgres) · **Google Gemini Flash** via `@google/genai` ·
Zod · Resend · Recharts · marked · deployed on **Vercel** with **Vercel Cron**.

All AI tasks use Gemini Flash (model from `GEMINI_MODEL`, currently `gemini-3.8-flash`). No other AI provider is used.

## How the weekly run works

```
Vercel Cron → /api/cron/weekly → runPipeline()
  1. load topics + keywords (Supabase)
  2. collect last-7-day posts from 4 sources in parallel, dedupe, keep top 300
  3. Gemini classifies posts (batches of 25)  +  in parallel: HN keyword counts this week vs last week
  4. save posts, compute trend % and Opportunity Score (code)
  5. Emerging Topic Radar (Gemini)
  6. Gemini writes the brief (numbers come from code; links come from evidence ids)
  7. email with Resend
  8. mark the run success / partial / failed with per-source status
```

A failing source never stops the run; the run is marked **partial** and `/runs` shows what failed.

## How the cron works

`vercel.json` registers one cron job:

```json
{ "crons": [{ "path": "/api/cron/weekly", "schedule": "30 2 * * 5" }] }
```

`30 2 * * 5` = 02:30 UTC every Friday = **08:00 IST**. Vercel calls the route with `Authorization: Bearer <CRON_SECRET>`;
the route rejects anything else with 401. The function may run up to 300 s (`maxDuration`); a run takes about 2 minutes.
Runs stuck in "running" for 15 minutes are marked failed, and a second run can't start while one is running.

## Setup (local)

Requirements: Node.js 20+, a Supabase project, and API keys listed below.

```bash
git clone https://github.com/niralidesai09/devpulse.git
cd devpulse
git checkout roadmap
npm install
cp .env.example .env.local   # then fill in the values
```

Create the database by running the SQL files in `supabase/migrations/` in order (Supabase SQL editor or CLI). Then:

```bash
npm run dev
```

Open http://localhost:3000. To run the pipeline locally:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/weekly
```

## Environment variables

| Name | What it is | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public read-only key (RLS allows SELECT only) | Supabase → API Keys |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only secret key (`sb_secret_…` or legacy `service_role`) | Supabase → API Keys |
| `GEMINI_API_KEY` | Google AI Studio key | https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | Gemini Flash model name | `gemini-3.8-flash` |
| `GITHUB_TOKEN` | GitHub token (no scopes needed) | GitHub → Settings → Developer settings |
| `STACKEXCHANGE_KEY` | Optional, raises Stack Exchange quota | https://stackapps.com |
| `RESEND_API_KEY` | Resend API key | https://resend.com/api-keys |
| `BRIEF_TO_EMAIL` | Who receives the brief (with `onboarding@resend.dev` it must be the Resend account's email) | — |
| `CRON_SECRET` | Protects `/api/cron/weekly` and debug endpoints | `openssl rand -hex 32` |
| `ADMIN_PASSCODE` | Unlocks Run now, topic editing and radar approvals | `openssl rand -base64 12` |

Secrets live only in `.env.local` (git-ignored) and in Vercel's environment variables.

## Deploy (Vercel)

The Vercel project is connected to this GitHub repo with **production branch `roadmap`**: every push deploys automatically.
Environment variables are set in Vercel → Settings → Environment Variables (same names as above). The cron is registered from
`vercel.json` on each production deploy.

## Project layout

```
app/            pages (/ /topics /runs /architecture), API routes (cron, run, ask, debug), server actions
components/     dashboard UI (chart, score explainer, radar, competitor/objection panels, Ask the Pulse)
lib/sources/    one adapter per data source + collector
lib/ai/         Gemini client, classifier, Ask the Pulse
lib/pipeline/   run orchestration, smart baseline, scoring, radar, brief
lib/email/      Resend email
lib/db/         Supabase clients and queries
supabase/       SQL migrations
docs/           Components Map
```

## Tests and verification

```bash
npm test
```

31 unit tests (no network): source normalisation, deduplication, attribution, evidence links, metrics, zero baselines, AI schema
validation, invalid URLs and partial runs.

```bash
npm run verify:provenance -- 8
```

Re-fetches a sample of stored posts from each source's official API and checks id, title, timestamp and URL (PASS / WARN / FAIL).

## Debug endpoints (local dev open; production needs `Authorization: Bearer CRON_SECRET`)

`/api/debug/sources` (live collection), `/api/debug/classify?n=10` (Gemini on live posts), `/api/debug/latest-run`,
`/api/debug/brief` (`?format=md`, `?regenerate=1`, `?email=1`).
