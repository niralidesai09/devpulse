# Known limitations (honest list)

## Data

- **Small weekly volumes.** The relevant discussion volume about code review automation is measured in tens per week, not thousands, so many pain points have 1–3 discussions a week. The app says so: it applies minimum-sample rules and shows counts rather than misleading percentages. Trends get more reliable with every weekly run.
- **First-run backfill.** The first collection retrieves the previous weeks retrospectively. Posts deleted since then, or changes in search ranking, can make older weeks slightly under-counted. The report discloses when most previous-week data was backfilled.
- **Truncation.** Each query has a page limit (HN 300 hits, GitHub 200, DEV 3 pages per tag, SO 12 pages). When a limit is hit, the source run is flagged `truncated` and shown on Data health. Broad keywords (for example "CodeRabbit" in GitHub titles) hit it most.
- **GitHub secondary rate limits** can stop the GitHub adapter early. It reports `partial`, keeps what it fetched, and drops out of week-on-week comparison if it did not cover both weeks.
- **Sources not included:** Reddit (needs OAuth app credentials and has commercial-use terms), X/Twitter, Discord, Lobsters (no documented API). See DATA_SOURCES.md.
- **Keyword dependence.** Discussions that use none of the configured phrases are missed. Topics and keywords are editable for this reason.
- **HN comments** inherit the parent story title as context ("Comment on: …"). The keyword must appear in the comment's own text.

## AI

- **Classification is a model judgement.** Relevance, unresolved status, frustration and severity come from Gemini Flash. They are not calibrated probabilities. Every discussion page shows the reasoning, and the PM can exclude misclassifications.
- **Opportunity confidence** (low/medium/high) is constrained by prompt rules but is still the model's statement, not a measured probability.
- **Numeric check is heuristic.** Unverifiable "N discussions" and "%" figures are flagged, not blocked.
- **Prompt changes are not retroactive.** Changing the analysis prompt affects new discussions only. Re-analysing history means resetting `analysis_status` and running again.
- **Semantic grouping can drift.** Two pain points can still overlap. Pain-point merge or split editing in the UI is not implemented.

## Platform

- **One invocation per run** (300 s). Very large backlogs are processed over several runs. The UI shows how many discussions are still pending.
- **Hobby cron timing** is within the scheduled hour, not to the minute.
- **No user accounts.** One shared admin passcode, and decisions are recorded as "pm". There is no per-user audit trail and no distributed login rate limiting.
- **Email** with the default Resend sender reaches only the Resend account owner's address until a domain is verified.
- **Shared database.** The same Supabase project is also used by the v1 branch (`roadmap`). The v2 migration is additive, and v1 tables remain.

## Next steps

1. Reddit adapter with OAuth credentials.
2. Pain-point merge/split UI, and re-analysis with a newer prompt.
3. Per-user accounts (Supabase Auth) for decision attribution.
4. Embedding-based pre-clustering before LLM consolidation, once volumes grow.
5. Slack delivery alongside email.
