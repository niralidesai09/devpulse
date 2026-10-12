// The Components Map: every part of Groundswell, what it does and which
// service it uses. Shown on /architecture (docs/COMPONENTS_MAP.md is the
// same list for the submission).

export type Component = { name: string; file: string; does: string; service: string };

export const COMPONENT_GROUPS: { title: string; items: Component[] }[] = [
  {
    title: "Triggers",
    items: [
      { name: "Weekly cron", file: "vercel.json → app/api/cron/weekly/route.ts", does: "Starts the full pipeline every Friday 02:30 UTC (08:00 IST). Requires Bearer CRON_SECRET.", service: "Vercel Cron" },
      { name: "Run now", file: "components/run-now.tsx → app/api/run/route.ts", does: "Starts the same pipeline on demand from the dashboard (live demos).", service: "Vercel Functions" },
      { name: "Admin passcode", file: "lib/admin.ts, app/actions.ts", does: "Unlocks Run now, topic editing and radar approvals via an httpOnly HMAC cookie.", service: "Next.js Server Actions" },
    ],
  },
  {
    title: "Live data collection",
    items: [
      { name: "Hacker News adapter", file: "lib/sources/hackernews.ts", does: "Stories + comments per keyword, last 7 days.", service: "HN Algolia API" },
      { name: "Stack Overflow adapter", file: "lib/sources/stackoverflow.ts", does: "All questions from the last 7 days, matched to keywords locally.", service: "Stack Exchange API v2.3" },
      { name: "GitHub Issues adapter", file: "lib/sources/github.ts", does: "Issues matching topic keywords (OR-grouped), bots skipped; open/closed kept as evidence.", service: "GitHub Search API" },
      { name: "DEV.to adapter", file: "lib/sources/devto.ts", does: "Newest articles from 10 relevant tags, matched to keywords.", service: "DEV.to (Forem) API" },
      { name: "Collector", file: "lib/sources/index.ts", does: "Runs all adapters in parallel, dedupes by URL, keeps the 300 most-engaged posts, records per-source status.", service: "—" },
    ],
  },
  {
    title: "AI (Google Gemini Flash only)",
    items: [
      { name: "Gemini client", file: "lib/ai/gemini.ts", does: "Structured JSON from a Zod schema, Zod validation, 1 retry on invalid JSON, backoff on 429/5xx.", service: "Gemini Flash (@google/genai, GEMINI_MODEL)" },
      { name: "Classifier", file: "lib/ai/classify.ts", does: "Per post: topic / other / irrelevant, pain point, unresolved + reason, sentiment, severity, competitors. Batches of 25, 3 in parallel.", service: "Gemini Flash" },
      { name: "Emerging Topic Radar", file: "lib/pipeline/radar.ts", does: "Clusters 'other' posts into suggested new topics; code checks evidence, duplicates and keywords.", service: "Gemini Flash" },
      { name: "Brief writer", file: "lib/pipeline/brief.ts", does: "Writes the 8-section Friday brief. Tables are made by code; Gemini cites [E#] ids that code turns into real links; numbers self-checked.", service: "Gemini Flash" },
      { name: "Ask the Pulse", file: "lib/ai/ask.ts → app/api/ask/route.ts", does: "Answers questions only from posts found by full-text search, with [S#] links; 'not enough data' otherwise.", service: "Gemini Flash + Supabase full-text search" },
    ],
  },
  {
    title: "Analysis (code, no AI)",
    items: [
      { name: "Smart baseline", file: "lib/pipeline/baseline.ts", does: "Exact-phrase keyword counts for this week and the 7 days before, so trends work from the first run.", service: "HN Algolia API" },
      { name: "Scoring", file: "lib/pipeline/scoring.ts", does: "Trend % (▲/▼/new) and Opportunity Score = frequency × growth × unresolved × severity, scaled 0–100.", service: "—" },
      { name: "Pipeline", file: "lib/pipeline/run.ts", does: "Orchestrates one run: collect → classify + baseline → save → score → radar → brief → email → status.", service: "Vercel Functions (max 300 s)" },
    ],
  },
  {
    title: "Storage, email, UI",
    items: [
      { name: "Database", file: "supabase/migrations/*.sql, lib/db/*", does: "topics, runs, posts (+ full-text index), topic_stats, briefs, suggested_topics. RLS: public read-only; writes only with the service-role key on the server.", service: "Supabase Postgres" },
      { name: "Email", file: "lib/email/brief-email.ts", does: "Sends the brief as HTML + text to BRIEF_TO_EMAIL; stores emailed_at or the error.", service: "Resend" },
      { name: "Dashboard", file: "app/page.tsx, components/*", does: "KPIs, ranked topics with 'Why this score?', trend chart, radar, competitors, objections, Ask, brief.", service: "Next.js on Vercel, Recharts" },
      { name: "Topics, Runs, Architecture pages", file: "app/topics, app/runs, app/architecture", does: "Edit monitored topics, see run history per source, explain the system.", service: "Next.js on Vercel" },
    ],
  },
];
