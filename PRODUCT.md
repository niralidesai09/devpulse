# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: Sumit**, the sole product manager at a 15-person startup that sells a code review automation tool to mid-size engineering teams. He reads Groundswell every Friday morning before his afternoon engineering sync and uses it for Monday sprint planning, to decide what to build next.
- **Secondary: exam evaluators** (Mesa AI final evaluation), who must be able to verify every number and claim back to real public discussions.

## Product Purpose

Groundswell turns a week of public developer discussion into a decision: which developer problems surface most often, whether they are rising or falling, which remain unresolved or underserved, and which could be product opportunities. Success: in under a minute Sumit knows the top developer problem, the top three opportunities and the evidence behind them, without having to trust AI text blindly.

## Positioning

Evidence-first developer intelligence: every count is computed by code from stored records, every claim links to the original thread, and AI interpretation is labelled and kept separate from source content. Coverage is limited to what it actually collects; it never claims to cover the whole internet.

## Operating Context

- Weekly ritual: Vercel Cron runs the pipeline every Friday at 08:00 IST; Sumit reads the emailed brief and the dashboard; Monday sprint planning uses the "3 things" recommendations.
- Live demo: the protected "Run now" button runs the full pipeline (~1.5–2 min) during a viva.
- Topics and keywords are edited by Sumit in the app (Supabase-backed); emerging-topic suggestions are approved or rejected by him.

## Capabilities and Constraints

- Sources actually integrated: Hacker News (Algolia), GitHub Issues (Search API), Stack Overflow (Stack Exchange API), DEV.to (Forem API). Reddit is not integrated (blocked: needs OAuth credentials).
- All AI tasks use Google Gemini Flash (`GEMINI_MODEL`); the model name belongs on the How it works page, not across the product.
- Next.js 16 App Router (Cache Components), Tailwind v4, Supabase Postgres, Recharts, Resend, Vercel. Branch `roadmap` is production.
- Metrics (see docs/DATA_AUDIT.md): "Mentions (all sources)" vs "Hacker News keyword matches" (HN-only, this vs previous 7 days, "too few to compare" under 5); run-over-run comparison only when a comparable previous weekly run exists (none yet); Opportunity Score is relative (top = 100).
- History is short: runs exist only since 11 Oct 2026; there is no multi-week history yet.
- Coverage limits are recorded per run (GitHub newest 100 per query; DEV.to newest 1,000 per tag).

## Brand Commitments

- Name: **Groundswell**. Tagline: "Catch developer pain before it peaks."
- Voice: clear, concise, professional English; honest about limits; no hype.
- User-pinned visual direction for the redesign (binding): warm off-white surfaces, charcoal type, restrained forest-green accent, editorial B2B intelligence feel; no gradients, glassmorphism, emojis or decorative effects.

## Evidence on Hand

Real stored data in Supabase: runs, posts (with source, id, URL, timestamps), topic_stats, briefs, suggested_topics. No testimonials, customers or benchmarks exist; none may be invented.

## Product Principles

1. Evidence before interpretation: every insight is one click from its source threads.
2. Measured ≠ interpreted: label AI interpretation; never present a hypothesis as market fact.
3. Honest gaps: missing or insufficient data is shown as such, never as zero or as a trend.
4. Decision first: the most important problem and opportunities lead; detail follows.
5. Transparent, not branded: AI use is disclosed, the model name stays in technical details.

## Accessibility & Inclusion

WCAG AA contrast, keyboard navigation with visible focus, meaningful labels; usable on desktop, tablet and mobile.
