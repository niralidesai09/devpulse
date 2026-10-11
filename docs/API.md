# API and scheduled job

All routes are in `app/api`. Responses are JSON unless noted otherwise.

| Method & path | Auth | Purpose | Responses |
|---|---|---|---|
| `GET /api/cron/weekly` | `Authorization: Bearer CRON_SECRET` | Weekly scheduled run: collect → analyse → brief → email. Runs inline (`maxDuration` 300). | `200` summary · `200 {skipped:true}` this week's scheduled run already exists · `409` another run in progress · `401` · `500` run failed (details stored on the run) |
| `POST /api/runs` | admin cookie (or cron bearer) | Manual run. Body `{ "mode": "manual" \| "retry", "resetFailed": bool }`. Responds immediately, then continues in the background with `after()`. | `202 {runId}` · `409 {runId}` already running · `401` |
| `GET /api/runs/:id` | public | Run status for progress polling (stage, per-source counts, report id) | `200` · `404` |
| `POST /api/reports` | admin cookie | Regenerate the brief from stored data, without collecting again | `200 {reportId}` · `422` brief failed (metrics still stored) · `401` |
| `GET /api/reports/:id/export?format=md\|json` | public | Download a stored report (Markdown with source links, or full JSON including evidence rows) | file download |
| `GET /api/health` | public | Integration configuration (booleans only) and database reachability | `200` |

Mutations from the UI (topics, keywords, sources, exclusions, decisions, login/logout) are **Server Actions** in `app/actions.ts`. Each one checks the admin session and validates its input with Zod.

## Scheduled job

`vercel.json`:

```json
{ "crons": [{ "path": "/api/cron/weekly", "schedule": "30 2 * * 5" }] }
```

- Vercel cron schedules are in **UTC**. `30 2 * * 5` is Friday 02:30 UTC, which is **Friday 08:00 IST**.
- Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when the `CRON_SECRET` env var is set on the project.
- On the **Hobby** plan, cron jobs run at most once a day, and the invocation may happen at any time **within the scheduled hour**. A weekly job is within limits. The Friday-morning brief may therefore arrive between 08:00 and 08:59 IST.
- Crons run only on the **production** deployment.
- Function limit: `maxDuration = 300` s. The pipeline time-boxes itself (see ARCHITECTURE → Time budget).
- **Duplicate protection:** the scheduled run's idempotency key is the end of the reporting week. A second delivery for the same week returns `skipped`.
- **Retry:** if the scheduled run fails, an admin can press **Retry failed** on Data health. That starts a `retry` run and re-queues failed analyses. Collection is idempotent.
- **Failure log:** every run is a row in `collection_runs`, with per-source rows in `source_runs`, stage, timings, warnings and errors. It is shown at `/health`.
- To trigger the scheduled path manually (for example on demo day): `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/weekly`. If this week's scheduled run already ran, it reports `skipped`; use **Run collection now** instead.

## Email

If `RESEND_API_KEY` and `BRIEF_TO_EMAIL` are set, the brief is emailed after it is generated, by both cron and manual runs. A report is marked `sent` only when Resend returns an email id. Otherwise it is marked `failed` with the error. With the default sender `onboarding@resend.dev`, Resend only delivers to the email address of the Resend account owner. Using any other recipient needs a verified domain and `BRIEF_FROM_EMAIL`.
