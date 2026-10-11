// The Components Map — single source for docs/COMPONENTS_MAP.md and /architecture.
// Keep in sync with the code (checked by tests/unit/componentsMap.test.ts).

export const COMPONENTS_MAP = `flowchart LR
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
`;

/** Tables the map claims exist — verified against the migrations by a unit test. */
export const MAP_TABLES = [
  "topics",
  "topic_keywords",
  "sources",
  "collection_runs",
  "source_runs",
  "discussions",
  "discussion_analysis",
  "pain_points",
  "reports",
  "report_pain_points",
  "report_evidence",
  "pain_point_decisions",
];

/** Routes the map claims exist — verified against app/ by a unit test. */
export const MAP_ROUTES = [
  "app/api/cron/weekly/route.ts",
  "app/api/runs/route.ts",
  "app/api/runs/[id]/route.ts",
  "app/api/reports/route.ts",
  "app/api/reports/[id]/export/route.ts",
  "app/api/health/route.ts",
  "app/page.tsx",
  "app/pain-points/page.tsx",
  "app/pain-points/[id]/page.tsx",
  "app/opportunities/page.tsx",
  "app/discussions/page.tsx",
  "app/discussions/[id]/page.tsx",
  "app/reports/page.tsx",
  "app/reports/[id]/page.tsx",
  "app/reports/compare/page.tsx",
  "app/decisions/page.tsx",
  "app/health/page.tsx",
  "app/settings/page.tsx",
  "app/login/page.tsx",
];
