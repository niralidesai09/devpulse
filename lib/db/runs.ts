// Collection runs = the job log. One row per pipeline execution (cron,
// manual or retry), plus one source_runs row per source per run.

import { PIPELINE_VERSION } from "@/lib/config";
import type { SourceOutcome } from "@/lib/sources/types";
import { check, getDb } from "./client";
import type { CollectionRunRow, RunStats, SourceRunRow, Trigger } from "./types";

/** A run still "running" after this long was killed (e.g. by the function time limit). */
export const STALE_RUN_MINUTES = 8;

export class RunInProgressError extends Error {
  constructor(public runId: string | null) {
    super("Another collection run is already in progress. Wait for it to finish, then try again.");
    this.name = "RunInProgressError";
  }
}

export class DuplicateScheduledRunError extends Error {
  constructor(public existing: Pick<CollectionRunRow, "id" | "status">) {
    super(`A scheduled run for this period already exists (${existing.status}).`);
    this.name = "DuplicateScheduledRunError";
  }
}

/** Mark runs that can no longer be alive as failed, so they don't block new runs forever. */
export async function failStaleRuns(): Promise<number> {
  const staleBefore = new Date(Date.now() - STALE_RUN_MINUTES * 60_000).toISOString();
  const res = await getDb()
    .from("collection_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error: `Did not finish within ${STALE_RUN_MINUTES} minutes (function was likely stopped by the platform time limit). Data saved before that point is kept; use Retry to continue.`,
    })
    .eq("status", "running")
    .lt("started_at", staleBefore)
    .select("id");
  return check(res, "Could not clean up stale runs")?.length ?? 0;
}

/**
 * Create the run row. Two database constraints make this safe without locks:
 *   - a partial unique index allows only ONE row with status = 'running';
 *   - idempotency_key is unique, so a scheduled period runs at most once
 *     even if Vercel delivers the cron request twice.
 */
export async function startRun(input: {
  trigger: Trigger;
  idempotencyKey: string | null;
  model: string | null;
}): Promise<CollectionRunRow> {
  const db = getDb();
  await failStaleRuns();
  const { data, error } = await db
    .from("collection_runs")
    .insert({
      trigger: input.trigger,
      idempotency_key: input.idempotencyKey,
      model: input.model,
      pipeline_version: PIPELINE_VERSION,
      stats: { stage: "starting" },
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505" && error.message.includes("idempotency_key")) {
      const existing = await db
        .from("collection_runs")
        .select("id, status")
        .eq("idempotency_key", input.idempotencyKey!)
        .single();
      throw new DuplicateScheduledRunError(existing.data ?? { id: "unknown", status: "failed" });
    }
    if (error.code === "23505") {
      const running = await db.from("collection_runs").select("id").eq("status", "running").maybeSingle();
      throw new RunInProgressError(running.data?.id ?? null);
    }
    throw new Error(`Could not create run: ${error.message}`);
  }
  return data as CollectionRunRow;
}

export async function updateRun(id: string, patch: Partial<Omit<CollectionRunRow, "id">>) {
  check(await getDb().from("collection_runs").update(patch).eq("id", id), "Could not update run");
}

/**
 * A failed scheduled run may be retried: release its idempotency key so
 * the period can be collected again (the original row is kept for the log).
 */
export async function releaseIdempotencyKey(runId: string) {
  check(
    await getDb().from("collection_runs").update({ idempotency_key: null }).eq("id", runId).eq("status", "failed"),
    "Could not release idempotency key",
  );
}

export async function saveSourceRuns(
  runId: string,
  window: { start: Date; end: Date },
  outcomes: (SourceOutcome & { newCount: number; duplicateCount: number })[],
) {
  if (!outcomes.length) return;
  const rows = outcomes.map((o) => ({
    run_id: runId,
    source_id: o.sourceId,
    status: o.status,
    window_start: window.start.toISOString(),
    window_end: window.end.toISOString(),
    requests: o.requests,
    failed_requests: o.failedRequests,
    fetched_count: o.discussions.length,
    new_count: o.newCount,
    duplicate_count: o.duplicateCount,
    truncated: o.truncated,
    error: o.error?.slice(0, 1000) ?? null,
    duration_ms: o.durationMs,
  }));
  check(await getDb().from("source_runs").upsert(rows, { onConflict: "run_id,source_id" }), "Could not save source status");
}

export async function getRun(id: string): Promise<(CollectionRunRow & { source_runs: SourceRunRow[] }) | null> {
  const res = await getDb().from("collection_runs").select("*, source_runs(*)").eq("id", id).maybeSingle();
  return check(res, "Could not load run") as (CollectionRunRow & { source_runs: SourceRunRow[] }) | null;
}

export async function listRuns(limit = 30): Promise<(CollectionRunRow & { source_runs: SourceRunRow[] })[]> {
  const res = await getDb()
    .from("collection_runs")
    .select("*, source_runs(*)")
    .order("started_at", { ascending: false })
    .limit(limit);
  return check(res, "Could not load runs") as (CollectionRunRow & { source_runs: SourceRunRow[] })[];
}

export async function getRunningRun(): Promise<CollectionRunRow | null> {
  const res = await getDb().from("collection_runs").select("*").eq("status", "running").maybeSingle();
  return check(res, "Could not load running run") as CollectionRunRow | null;
}

/** All source runs that succeeded or partially succeeded — used for coverage per period. */
export async function listUsableSourceRuns(since: Date): Promise<SourceRunRow[]> {
  const res = await getDb()
    .from("source_runs")
    .select("*")
    .in("status", ["succeeded", "partial"])
    .gte("window_end", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(2000);
  return check(res, "Could not load source coverage") as SourceRunRow[];
}

export function mergeStats(prev: RunStats, next: RunStats): RunStats {
  return {
    ...prev,
    ...next,
    timingsMs: { ...(prev.timingsMs ?? {}), ...(next.timingsMs ?? {}) },
    warnings: [...(prev.warnings ?? []), ...(next.warnings ?? [])],
  };
}
