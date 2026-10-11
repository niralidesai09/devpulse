// POST /api/runs — start a collection run on demand (admin only).
// Body (optional JSON): { "mode": "manual" | "retry", "resetFailed": boolean }
//   retry + resetFailed: discussions whose analysis failed are queued again.
// Responds 202 immediately with the run id; the pipeline continues in the
// background via after() (bounded by maxDuration). Poll GET /api/runs/:id.

import { after } from "next/server";
import { requestIsAdmin } from "@/lib/auth";
import { resetFailedAnalysis } from "@/lib/db/discussions";
import { RunInProgressError } from "@/lib/db/runs";
import { errorMessage } from "@/lib/log";
import { createRun, executeRun } from "@/lib/pipeline/run";

export const maxDuration = 300;

export async function POST(request: Request) {
  if (!requestIsAdmin(request)) return Response.json({ error: "Admin access required." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { mode?: string; resetFailed?: boolean };
  const mode = body.mode === "retry" ? "retry" : "manual";
  const startedAt = Date.now();
  try {
    const run = await createRun(mode);
    if (body.resetFailed) await resetFailedAnalysis();
    after(() => executeRun(run, { startedAt }));
    return Response.json({ runId: run.id, status: "running" }, { status: 202 });
  } catch (err) {
    if (err instanceof RunInProgressError) return Response.json({ error: err.message, runId: err.runId }, { status: 409 });
    return Response.json({ error: errorMessage(err) }, { status: 500 });
  }
}
