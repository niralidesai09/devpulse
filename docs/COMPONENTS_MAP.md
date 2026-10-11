# Components Map — Developer Community Pulse

> Generated from `lib/componentsMap.ts` (the same source renders the diagram at **/architecture** in the app).
> `tests/unit/componentsMap.test.ts` fails if a table or route on this map does not exist in the code, or if this file drifts from the source.

```mermaid
flowchart LR
  subgraph EXT["External data sources (public APIs)"]
    HN["Hacker News<br/>Algolia Search API"]
    GH["GitHub Issues<br/>REST search API"]
    SO["Stack Overflow<br/>Stack Exchange API 2.3"]
    DEV["DEV Community<br/>Forem API v1"]
  end

  subgraph VERCEL["Vercel (Next.js 16, Node runtime, server-only secrets)"]
    CRON["Vercel Cron<br/>Fri 02:30 UTC = 08:00 IST"]
    subgraph API["Route handlers"]
      RCRON["GET /api/cron/weekly<br/>Bearer CRON_SECRET"]
      RRUN["POST /api/runs<br/>admin cookie · after()"]
      RREP["POST /api/reports<br/>admin cookie"]
      RSTAT["GET /api/runs/:id · /api/health<br/>GET /api/reports/:id/export"]
    end
    subgraph PIPE["Pipeline (lib/pipeline, time-boxed 285 s)"]
      CFG["1 · Load config<br/>topics · keywords · sources"]
      COL["2 · Collect<br/>source adapters · retry · rate limits"]
      NORM["3 · Normalise + dedupe<br/>source id · normalised URL"]
      ING["4 · Idempotent ingest<br/>ingest_discussions()"]
      ANA["5 · Analyse (Stage A)<br/>relevance · topic · pain point · quote check"]
      CON["6 · Consolidate (Stage B)<br/>semantic grouping"]
      MET["7 · Metrics (code only)<br/>IST weeks · WoW · signal score"]
      BRF["8 · Brief (Stage C)<br/>evidence pack → grounded JSON"]
      DEL["9 · Store + deliver"]
    end
    subgraph UI["Pages (server-rendered)"]
      P1["/ Overview"]
      P2["/pain-points · /pain-points/:id"]
      P3["/opportunities"]
      P4["/discussions · /discussions/:id"]
      P5["/reports · /reports/:id · /reports/compare"]
      P6["/decisions · /health · /settings · /login"]
    end
    ACT["Server Actions<br/>requireAdmin + Zod"]
  end

  GEM["Google Gemini Flash<br/>@google/genai · JSON schema"]
  RES["Resend email<br/>(optional)"]

  subgraph SB["Supabase Postgres (RLS on, no anon access)"]
    T1[("topics · topic_keywords · sources")]
    T2[("collection_runs · source_runs")]
    T3[("discussions")]
    T4[("discussion_analysis · pain_points")]
    T5[("reports · report_pain_points · report_evidence")]
    T6[("pain_point_decisions")]
  end

  CRON --> RCRON --> CFG
  RRUN --> CFG
  RREP --> MET
  CFG --> T1
  CFG --> COL
  COL --> HN & GH & SO & DEV
  COL --> NORM --> ING --> T3
  COL --> T2
  ING --> ANA
  ANA <--> GEM
  ANA --> CON
  CON <--> GEM
  CON --> T4
  T3 & T4 & T2 --> MET
  MET --> BRF
  BRF <--> GEM
  BRF --> DEL --> T5
  DEL --> RES
  UI --> T1 & T3 & T4 & T5 & T6
  ACT --> T1 & T3 & T6
  P6 -. edits .-> ACT
```

## Legend and data flow

| # | Step | Component (code) | Reads / writes |
|---|------|------------------|----------------|
| 0 | Trigger | Vercel Cron → `GET /api/cron/weekly` (Bearer `CRON_SECRET`), or admin `POST /api/runs` | `collection_runs` (one running at a time, one cron run per week) |
| 1 | Load config | `lib/db/config.ts#getActiveConfig` | `topics`, `topic_keywords`, `sources` |
| 2 | Collect | `lib/sources/{hackernews,github,stackoverflow,devto}.ts` behind `SourceAdapter` | public APIs; `source_runs` |
| 3 | Normalise + dedupe | `lib/sources/index.ts#dedupeDiscussions`, `lib/text.ts` | — |
| 4 | Idempotent ingest | Postgres `ingest_discussions()` via `lib/db/discussions.ts` | `discussions` |
| 5 | Analyse (Gemini Flash) | `lib/ai/analyze.ts` | `discussion_analysis` |
| 6 | Consolidate (Gemini Flash) | `lib/ai/consolidate.ts` | `pain_points` |
| 7 | Metrics (code) | `lib/analytics/metrics.ts`, `lib/time/periods.ts` | reads all of the above |
| 8 | Brief (Gemini Flash) | `lib/ai/brief.ts` (evidence pack → grounded JSON) | — |
| 9 | Store + deliver | `lib/pipeline/report.ts`, `lib/email/sendBrief.ts` (Resend) | `reports`, `report_pain_points`, `report_evidence` |
| — | UI | `app/**/page.tsx` (server components), `components/*` | read-only via server |
| — | Mutations | `app/actions.ts` (Server Actions: `requireAdmin` + Zod) | `topics`, `topic_keywords`, `sources`, `discussions.is_excluded`, `pain_point_decisions` |

## Database relationships

```mermaid
erDiagram
  topics ||--o{ topic_keywords : has
  topics ||--o{ pain_points : categorises
  sources ||--o{ discussions : provides
  sources ||--o{ source_runs : "collected in"
  collection_runs ||--o{ source_runs : records
  collection_runs ||--o{ reports : produces
  discussions ||--o| discussion_analysis : "interpreted by"
  pain_points ||--o{ discussion_analysis : groups
  topics ||--o{ discussion_analysis : "assigned to"
  reports ||--o{ report_pain_points : snapshots
  reports ||--o{ report_evidence : cites
  discussions ||--o{ report_evidence : "cited as"
  pain_points ||--o{ pain_point_decisions : "decided on"
```

## Security boundaries

- **Browser ↔ server:** the browser never calls Supabase or Gemini. Secrets live only in server env vars.
- **Admin boundary:** every mutation re-checks an HMAC-signed httpOnly session cookie on the server.
- **Cron boundary:** `/api/cron/weekly` requires `Authorization: Bearer CRON_SECRET`.
- **Database boundary:** RLS enabled, no policies for `anon`/`authenticated` on v2 tables; service-role key server-side only.
- **AI boundary:** external text is delimited and treated as untrusted; model output is schema-validated and can only reference keys created by code.
