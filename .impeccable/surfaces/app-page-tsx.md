---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: ["app/trends/page.tsx","app/opportunities/page.tsx","app/evidence/page.tsx","app/ask/page.tsx","app/topics/page.tsx","app/runs/page.tsx","app/architecture/page.tsx"]
---

# Surface brief: Groundswell app (all routes)

Scope: the whole authenticated-free app shell (Overview, Trends, Opportunities, Evidence, Ask, Topics, Runs, How it works). Mode: Operate.
Audience/job: Sumit reads it weekly to decide what to build; evaluators trace every number to a public thread.
Proof/content: real Supabase data only (runs, posts, topic_stats, briefs, suggested_topics). Never invent history, percentages or quotes.
Constraints: pinned palette (warm off-white, charcoal, forest green); Next 16 Cache Components; Recharts; no new UI framework; Gemini named only on How it works.

## Direction contract

THESIS: Groundswell is an archive's finding aid for developer pain: every claim is a catalogued record with an accession id and provenance, and the cataloguer's note (AI) sits visibly apart from the original document. It refuses the KPI-tile SaaS dashboard of equal rounded cards.

OWN-WORLD: Warm finding-aid paper (#F6F4EE) with a cooler sidebar stock, charcoal ink, archival-binding forest green as the single accent for active and positive state. Hairline rules, no shadows on content, square-ish 6px corners max. Libre Franklin for interface and labels, Source Serif 4 for the editorial headline and insight statements, Source Code Pro only for record ids and figures that must align. Lifecycle state vocabulary on one fixed scale: new, rising, steady, falling, too few to compare.

STORY: In one screen Sumit sees the week, the single most important problem with its measured evidence, the next opportunities, and what is moving; every item opens its source records.

FIRST VIEWPORT: Left sidebar (brand, 8 routes, freshness). Main: serif headline "The developer signal this week" with period and freshness on one line, source-health strip right; a ruled four-column ledger of KPIs; below, a 2:1 split, left the lead problem set large in serif with measured line and three catalogued records, right the ranked top three opportunities. Run now sits top-right of the header.

FORM: Archival finding aid / library catalogue (candidate 7 of 7). Raises: lifecycle states on a fixed comparable scale (from botanical folio); tabular figures in a fixed column grid, changes held visible (from gate board); one visible hairline grid armature (from Crouwel specimen). Seed key: f79790aa.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
