# Demo script (≤ 5 minutes)

**URL:** https://devpulse-v2-delta.vercel.app. Record at 1440×900, browser zoom 100%, light or dark mode.
Before recording: sign in at `/login` in a second tab, and pick one pain point with 3+ discussions (top of `/pain-points`).

> Say only what the screen shows. If a source shows "partial" on Data health, say so: it is a feature, not a bug.

| Time | Screen | What to say |
|---|---|---|
| 0:00–0:25 | Overview, top of page | "Sumit is the only PM at a code-review-automation startup. Every Friday he spends 90 minutes reading developer forums. Developer Community Pulse does that for him: it collects real discussions, finds recurring pain points, compares this week with last week, and writes an evidence-backed brief." |
| 0:25–0:55 | Overview stat tiles + warning callout | "This is the latest complete reporting week, Friday to Thursday in IST. Four different numbers, kept separate: unique discussions collected, the ones Gemini judged relevant, distinct pain points, and AI recommendations. The yellow box is the system being honest about data limits, for example which sources are comparable week on week." |
| 0:55–1:30 | "This week's brief" card → click an evidence chip | "The brief is written by Gemini Flash, but every bullet has to cite real discussions. If it cites nothing, code removes it. This chip opens the original Hacker News thread." *(show the thread, come back)* |
| 1:30–2:10 | Pain points table → click the top pain point | "Pain points are canonical problems. Gemini groups different wordings of the same problem, so they're counted once. Counts, change and the signal score are computed in code. Here: this week vs previous, the 4-week trend, unresolved share, workarounds developers describe, tools named, and the supporting discussions, with the author's verbatim quote kept apart from the AI paraphrase." |
| 2:10–2:30 | Same page: Evidence graph + record a decision ("Validate with users", one-line rationale) | "This is the evidence graph: recommendation, to pain point, to discussions, to source URLs. And Sumit's own decision is stored separately from AI suggestions." |
| 2:30–2:55 | `/opportunities` | "Opportunities are hypotheses, labelled as such: observed dissatisfaction, the existing workaround, a falsifiable hypothesis, an interview question and a success criterion." |
| 2:55–3:25 | `/discussions` → filter Source = Hacker News → open one → "Details" | "The source explorer has every collected discussion, with search and filters. On the right is the model's interpretation and the reasoning behind it. Anything irrelevant can be excluded from future analysis." |
| 3:25–3:55 | `/settings` → add keyword "merge queue flaky" to a topic → show success | "Topics and keywords live in Supabase. I've just added a keyword; the next collection uses it, with no redeploy." |
| 3:55–4:20 | `/health` → expand the latest run | "Data health shows every run: per-source status, new vs duplicate records, truncation, analysis results. Re-running a collection never inflates the counts. The Friday 08:00 IST run is a Vercel cron job." |
| 4:20–4:50 | `/architecture` | "The architecture is one Next.js app on Vercel, Supabase Postgres, four public APIs, and Gemini Flash for all three AI stages. The model interprets; code counts. External text is treated as untrusted input." |
| 4:50–5:00 | `/reports` → open latest → "Export Markdown" | "Every brief is saved as a snapshot, printable and exportable, and two weeks can be compared. That's Developer Community Pulse." |

## Recording checklist

- [ ] `/api/health` shows `database.ok: true` and the Gemini model is a Flash model.
- [ ] The latest run on `/health` is succeeded or partial (not failed), and the latest report is "succeeded".
- [ ] You are signed in (for the decision and keyword steps). Delete the demo keyword afterwards.
- [ ] Notifications are muted; no other tabs show secrets (`.env.local`, Vercel env page).
- [ ] The video is ≤ 5:00. Export as MP4 and upload it as the course instructions require.
- [ ] Do not claim the email was delivered unless the report page shows "Emailed … (provider id …)".
