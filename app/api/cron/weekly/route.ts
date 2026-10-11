// GET /api/cron/weekly — called by Vercel Cron (see vercel.json) every Friday
// 02:30 UTC = 08:00 Asia/Kolkata. Vercel sends "Authorization: Bearer CRON_SECRET".
//
// Duplicate deliveries are harmless: the run for a reporting week has a unique
// idempotency key, so a second call for the same week returns 200 "already ran".

import { hasCronSecret } from "@/lib/auth";
import { DuplicateScheduledRunError, RunInProgressError } from "@/lib/db/runs";
import { errorMessage, logger } from "@/lib/log";
import { createRun, executeRun } from "@/lib/pipeline/run";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!hasCronSecret(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const startedAt = Date.now();
  const log = logger({ route: "cron.weekly" });
  try {
    const run = await createRun("cron");
    const summary = await executeRun(run, { startedAt });
    return Response.json(summary, { status: summary.status === "failed" ? 500 : 200 });
  } catch (err) {
    if (err instanceof DuplicateScheduledRunError) {
      log.info("cron.duplicate", { existing: err.existing });
      return Response.json({ skipped: true, reason: err.message, runId: err.existing.id });
    }
    if (err instanceof RunInProgressError) return Response.json({ error: err.message, runId: err.runId }, { status: 409 });
    log.error("cron.error", { error: errorMessage(err) });
    return Response.json({ error: errorMessage(err) }, { status: 500 });
  }
}
