# Groundswell: Components Map

**Live app:** https://devpulse-sable-seven.vercel.app · **Diagram:** https://devpulse-sable-seven.vercel.app/architecture
**Repository:** https://github.com/niralidesai09/devpulse (branch `roadmap`)

Groundswell is a weekly developer-community intelligence digest for Sumit, the PM of a code review automation startup.
Every Friday at 08:00 IST it collects live discussions, analyses them with **Google Gemini Flash**, and emails an evidence-linked brief.

## Data flow (one weekly run)

```
Vercel Cron (Fri 02:30 UTC = 08:00 IST)  or  "Run now" (admin passcode)
        │
        ▼
/api/cron/weekly  →  runPipeline()   (one Vercel Function, ~2 min, limit 300 s)
        │
        ├─ 1. Load active topics + keywords ............................ Supabase
        ├─ 2. Collect last-7-day posts (parallel, dedupe, top 300) ..... HN Algolia · Stack Exchange · GitHub · DEV.to
        ├─ 3a. Classify posts in batches of 25 ........................... Gemini Flash
        ├─ 3b. (in parallel) keyword counts this week vs last week ....... HN Algolia  (smart baseline)
        ├─ 4. Save posts; compute trend % + Opportunity Score (code) ..... Supabase
        ├─ 5. Emerging Topic Radar: cluster "other" posts ................ Gemini Flash → suggested_topics
        ├─ 6. Write the 8-section Friday brief ........................... Gemini Flash → briefs
        ├─ 7. Email the brief .......................................... Resend → BRIEF_TO_EMAIL
        └─ 8. Mark run success / partial / failed (+ per-source status) .. Supabase
        
Dashboard (Next.js on Vercel) reads Supabase  ·  Ask the Pulse: question → /api/ask → search_posts() (Postgres full-text) → Gemini Flash → answer with links
```

## Components

### Triggers
| Component | File | What it does | Service |
|---|---|---|---|
| Weekly cron | `vercel.json` → `app/api/cron/weekly/route.ts` | Starts the pipeline every Friday 02:30 UTC (08:00 IST). Requires `Authorization: Bearer CRON_SECRET`. | Vercel Cron |
| Run now | `components/run-now.tsx` → `app/api/run/route.ts` | Starts the same pipeline on demand (live demo). | Vercel Functions |
| Admin passcode | `lib/admin.ts`, `app/actions.ts` | Unlocks Run now, topic editing and radar approvals (httpOnly HMAC cookie, re-checked on the server). | Next.js Server Actions |

### Live data collection (`lib/sources`)
| Component | File | What it does | Service |
|---|---|---|---|
| Hacker News adapter | `hackernews.ts` | Stories + comments per keyword, last 7 days. | HN Algolia API |
| Stack Overflow adapter | `stackoverflow.ts` | All questions of the last 7 days, matched to keywords locally (saves quota). | Stack Exchange API v2.3 |
| GitHub Issues adapter | `github.ts` | Issues matching topic keywords (≤ 6 per OR query), bot authors skipped; open/closed kept as evidence. | GitHub Search API |
| DEV.to adapter | `devto.ts` | Newest 1,000 articles from 10 relevant tags, matched to keywords. | DEV.to (Forem) API |
| Collector | `index.ts` | Runs adapters in parallel, dedupes by normalised URL, keeps the 300 most-engaged posts, records per-source status. A failing source never stops the run. | — |

### AI: Google Gemini Flash only
| Component | File | What it does | Service |
|---|---|---|---|
| Gemini client | `lib/ai/gemini.ts` | Zod schema → JSON Schema (`responseJsonSchema`), reply validated with Zod, 1 retry on invalid JSON, backoff on 429/5xx. Model from `GEMINI_MODEL`. | Gemini Flash via `@google/genai` |
| Classifier | `lib/ai/classify.ts` | Per post: topic / "other" / irrelevant, one-line pain point, unresolved + reason (uses source signals), sentiment −1..1, severity 1–5, competitors. | Gemini Flash |
| Emerging Topic Radar | `lib/pipeline/radar.ts` | Clusters "other" posts into ≤ 4 suggested topics; code requires ≥ 2 real threads, no duplicate names, ≥ 3 new keywords. | Gemini Flash |
| Brief writer | `lib/pipeline/brief.ts` | 8-section brief. Tables are rendered by code; Gemini cites `[E#]` evidence ids that code converts into real links; numbers self-checked. | Gemini Flash |
| Ask the Pulse | `lib/ai/ask.ts`, `app/api/ask/route.ts` | Answers only from posts found by full-text search, with `[S#]` links; "not enough data" otherwise. | Gemini Flash + Supabase |

### Analysis (code, no AI)
| Component | File | What it does | Service |
|---|---|---|---|
| Smart baseline | `lib/pipeline/baseline.ts` | Exact-phrase keyword counts for this week and the previous 7 days, so trends work from the very first run. | HN Algolia API |
| Scoring | `lib/pipeline/scoring.ts` | Trend % (▲ / ▼ / new) and Opportunity Score = frequency × growth × unresolved × severity, scaled so the best topic = 100. | — |
| Pipeline | `lib/pipeline/run.ts` | Orchestrates one run and records timings, errors and status. | Vercel Functions |

### Storage, email, UI
| Component | File | What it does | Service |
|---|---|---|---|
| Database | `supabase/migrations/*.sql`, `lib/db/*` | `topics`, `runs`, `posts` (+ full-text index), `topic_stats`, `briefs`, `suggested_topics`. RLS on: public read-only; writes only on the server with the service-role key. | Supabase Postgres |
| Email | `lib/email/brief-email.ts` | Sends the brief (HTML + text) from `onboarding@resend.dev` to `BRIEF_TO_EMAIL`; stores `emailed_at` or the error. | Resend |
| Dashboard `/` | `app/page.tsx`, `components/*` | KPIs, topics ranked by score with "Why this score?", week-over-week chart, emerging radar, competitor & objection radar, Ask the Pulse, brief. | Next.js on Vercel, Recharts |
| `/topics` | `app/topics/page.tsx` | Add / edit / pause topics and keywords (passcode). | Next.js on Vercel |
| `/runs` | `app/runs/page.tsx` | Run history with per-source status, brief and email status. | Next.js on Vercel |
| `/architecture` | `app/architecture/page.tsx` | This map plus the diagram. | Next.js on Vercel |

## External services
| Service | Used for | Key / config |
|---|---|---|
| Google Gemini Flash | All AI tasks | `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-3.8-flash` |
| Supabase | Postgres database, full-text search | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Hacker News (Algolia) | Posts + smart baseline | none |
| Stack Exchange API | Posts | `STACKEXCHANGE_KEY` (optional) |
| GitHub Search API | Issues | `GITHUB_TOKEN` |
| DEV.to API | Articles | none |
| Resend | Email delivery | `RESEND_API_KEY`, `BRIEF_TO_EMAIL` |
| Vercel | Hosting + Cron | `CRON_SECRET`, `ADMIN_PASSCODE` |
