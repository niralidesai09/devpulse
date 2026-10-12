# UX redesign: audit and decisions

## 1. Audit of v2 (12 Oct 2026)

### What works (kept as is)
All backend features are real and are kept unchanged:

- collection from 4 sources
- Gemini analysis, grouping and merge
- deterministic metrics
- grounded weekly briefs with evidence
- email
- topic/keyword/source CRUD
- exclusions
- decisions
- run log
- cron
- export
- report comparison

No route shows mock data.

### What made it hard to use

| Problem | Where |
|---|---|
| The first thing on the page was a yellow block of data caveats, so the product looked broken before it said anything useful | Overview |
| Four equal-weight boxes with internal terms ("Unique discussions", "Relevant to our market") and no hierarchy | Overview |
| The AI brief was a dense paragraph, each bullet followed by a row of identical-looking "Comment on: …" chips | Overview |
| Ten sections on one page at the same visual weight (tables, three side lists, charts, sources), with no reading order | Overview |
| Technical vocabulary everywhere: "signal score", "comparable sources", "untruncated", "insufficient_data" | All pages |
| Nine navigation items, including internal pages (Decisions, Architecture) at the same level as core tasks | Sidebar |
| Topics, sources and admin mixed on one "Settings" page | Settings |
| Opportunities had no list → detail structure; everything rendered at once | Opportunities |
| Feedback was inline text and `window.confirm` dialogs; no toasts | Forms |
| Dark, dense tables; everything boxed | Global |

## 2. New information architecture

| Navigation | Route | One purpose |
|---|---|---|
| **Overview** | `/` | What happened this week, why it matters, what to do next |
| **Discussions** | `/discussions`, `/discussions/:id` | Read the evidence: search and filter what developers wrote |
| **Pain Points** | `/pain-points`, `/pain-points/:id` | The core: each recurring problem with evidence, trend, implication, next step, and the PM decision |
| **Opportunities** | `/opportunities`, `/opportunities/:n` | Product hypotheses to validate, with experiment, interview question and decision |
| **Weekly Briefs** | `/reports`, `/reports/:id`, `/reports/compare` | Saved reports as readable documents |
| *Secondary:* **Monitored Topics** | `/topics` | What the app watches (topics and keywords) |
| *Secondary:* **Sources & Data Health** | `/health` | Whether collection works: sources, runs, errors, retry |
| *Bottom:* How it works | `/architecture` | Components map (for evaluators) |

Consolidated: `/settings` → split into `/topics` and `/health`. `/decisions` → the decision log now lives on Pain Points and Opportunities (the old URLs redirect).

## 3. Visual system

- **Colour:**
  - Warm near-white page `#F7F6F3`, off-white panels `#FDFCFA`, charcoal text `#1F1E1B`, hairline warm-grey borders.
  - One accent: indigo `#4B55C8`.
  - Green, amber and red only for meaning (fading, growing, failure), always with a word or icon.
- **Type:** Geist Sans.
  - Page title 28/34 semibold, section heading 15 semibold, body 14/22, metadata 12.
  - Numbers use tabular figures.
- **Space:** 4-px scale; sections 40 px apart; content max width 1120 px.
- **Shape:** radius 8 (controls) and 12 (panels); hairline borders; almost no shadow.
- **Hierarchy:** whitespace, dividers and type before boxes; few cards.
- **Icons:** Lucide line icons at 16 px, only where they help recognition (navigation, status, actions).
- **Charts:** one chart-like element on the Overview (topic movement as paired bars), in accent and neutral grey only.

## 4. Language changes

| Before | After |
|---|---|
| Unique discussions / Relevant to our market | Discussions analysed / **Relevant discussions** |
| Signal score | **Priority** (with an explanation of how it is computed) |
| insufficient_data | **Too early to tell** |
| new | **Newly observed** |
| gone | **Not seen this week** |
| Comparable sources / untruncated | "Trend uses Hacker News and Stack Overflow, the sources collected in full for both weeks" |
| AI badge | "AI summary", "Written by Gemini from N discussions" |
