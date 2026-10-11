// GET /api/runs/:id — run status for the progress indicator (public, read-only).

import { getRun } from "@/lib/db/runs";
import { errorMessage } from "@/lib/log";

export async function GET(_request: Request, ctx: RouteContext<"/api/runs/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Invalid id" }, { status: 400 });
  try {
    const run = await getRun(id);
    if (!run) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({
      id: run.id,
      status: run.status,
      trigger: run.trigger,
      stage: run.stats?.stage ?? null,
      startedAt: run.started_at,
      finishedAt: run.finished_at,
      error: run.error,
      reportId: run.stats?.reportId ?? null,
      sources: run.source_runs.map((s) => ({ source: s.source_id, status: s.status, fetched: s.fetched_count, new: s.new_count })),
    });
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 500 });
  }
}
