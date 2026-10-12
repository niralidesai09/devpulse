// One pipeline execution (cron, manual or retry):
//
//   collect  → analyse (Gemini, incremental) → consolidate pain points
//            → deterministic metrics → Gemini brief → store → email
//
// Each stage records its outcome on the run row. A time budget keeps the
// whole thing inside Vercel's function limit: analysis stops starting new
// batches when time runs short (the rest stays "pending" for the next run)
// and the report is skipped — not faked — if there is no time left for it.

import { getModel, isGeminiConfigured } from "@/lib/ai/gemini";
import { FUNCTION_MAX_SECONDS, REPORT_TIMEZONE, REPORT_WEEK_END_DAY } from "@/lib/config";
import { getActiveConfig } from "@/lib/db/config";
import { mergeStats, startRun, updateRun } from "@/lib/db/runs";
import type { CollectionRunRow, RunStats, Trigger } from "@/lib/db/types";
import { errorMessage, logger } from "@/lib/log";
import { latestCompletePeriod } from "@/lib/time/periods";
import { runAnalysis } from "./analyze";
import { runCollection } from "./collect";
import { generateReport } from "./report";

// Leave headroom under the 300 s platform limit.
const BUDGET_MS = (FUNCTION_MAX_SECONDS - 15) * 1000;
const REPORT_RESERVE_MS = 110_000; // stop starting analysis batches early enough for the brief (a batch in flight can take ~45 s)

/** The scheduled run for a reporting week can happen only once (see collection_runs.idempotency_key). */
export function cronIdempotencyKey(now = new Date()): string {
  const p = latestCompletePeriod(now, REPORT_TIMEZONE, REPORT_WEEK_END_DAY);
  return `cron:${p.end.toISOString()}`;
}

export async function createRun(trigger: Trigger, now = new Date()): Promise<CollectionRunRow> {
  return startRun({
    trigger,
    idempotencyKey: trigger === "cron" ? cronIdempotencyKey(now) : null,
    model: isGeminiConfigured() ? getModel() : null,
  });
}

export type RunSummary = {
  runId: string;
  status: "succeeded" | "partial" | "failed";
  reportId: string | null;
  stats: RunStats;
  error: string | null;
};

export async function executeRun(run: CollectionRunRow, opts: { startedAt?: number } = {}): Promise<RunSummary> {
  const t0 = opts.startedAt ?? Date.now();
  const log = logger({ runId: run.id, trigger: run.trigger });
  let stats: RunStats = { stage: "starting", timingsMs: {}, warnings: [] };
  const save = async (next: RunStats, extra: Record<string, unknown> = {}) => {
    stats = mergeStats(stats, next);
    await updateRun(run.id, { stats, ...extra });
  };
  const elapsed = () => Date.now() - t0;

  try {
    // 1. Configuration (read fresh — edits apply without redeploying)
    const config = await getActiveConfig();
    if (!config.topics.length) throw new Error("No active topic with active keywords. Add one in Settings → Topics.");
    if (!config.sourceIds.length) throw new Error("All sources are disabled. Enable at least one in Settings → Sources.");
    await updateRun(run.id, { config_snapshot: config.snapshot });

    // 2. Collect
    await save({ stage: "collecting" });
    const c = await runCollection(run.id, config, log);
    await save(
      {
        stage: "collected",
        fetched: c.fetched,
        uniqueInRun: c.uniqueInRun,
        duplicatesWithinRun: c.duplicatesWithinRun,
        inserted: c.inserted,
        alreadyStored: c.alreadyStored,
        timingsMs: { collect: elapsed() },
        warnings: c.outcomes.filter((o) => o.status !== "succeeded").map((o) => `${o.sourceId}: ${o.status} — ${o.error ?? "no detail"}`),
      },
      { lookback_start: c.window.start.toISOString(), lookback_end: c.window.end.toISOString() },
    );
    if (c.allFailed) throw new Error("Every data source failed; nothing was collected. See per-source errors below.");

    // 3. Analyse (incremental, time-boxed)
    let analysisDegraded = false;
    if (!isGeminiConfigured()) {
      analysisDegraded = true;
      await save({ stage: "analysis_skipped", warnings: ["GEMINI_API_KEY / GEMINI_MODEL not set: discussions stored but not analysed."] });
    } else {
      await save({ stage: "analysing" });
      const tA = Date.now();
      const a = await runAnalysis({
        runId: run.id,
        config,
        log,
        shouldStop: () => elapsed() > BUDGET_MS - REPORT_RESERVE_MS,
      });
      analysisDegraded = a.failed > 0;
      await save({
        stage: "analysed",
        analyzed: a.analyzed,
        relevant: a.relevant,
        irrelevant: a.irrelevant,
        analysisFailed: a.failed,
        pendingAfterRun: a.pending,
        newPainPoints: a.newPainPoints,
        timingsMs: { analyse: Date.now() - tA },
        warnings: a.warnings,
      });
    }

    // 4. Report (only if there is time; otherwise say so honestly)
    let reportId: string | null = null;
    let reportFailed = false;
    if (!isGeminiConfigured()) {
      reportFailed = true;
      await save({ stage: "report_skipped", reportStatus: "skipped", reportError: "Gemini not configured" });
    } else if (elapsed() > BUDGET_MS - 45_000) {
      reportFailed = true;
      await save({
        stage: "report_skipped",
        reportStatus: "skipped",
        reportError: "Not enough time left in this invocation. Use “Generate report” to create it from the stored data.",
      });
    } else {
      await save({ stage: "reporting" });
      const tR = Date.now();
      const r = await generateReport({ runId: run.id, trigger: run.trigger, log });
      reportId = r.reportId;
      reportFailed = r.status === "failed";
      await save({ stage: "reported", reportId, reportStatus: r.status, reportError: r.error, timingsMs: { report: Date.now() - tR } });
    }

    const status = c.anyDegraded || analysisDegraded || reportFailed ? "partial" : "succeeded";
    await save({ stage: "done", timingsMs: { total: elapsed() } }, { status, finished_at: new Date().toISOString() });
    log.info("run.done", { status, ms: elapsed() });
    return { runId: run.id, status, reportId, stats, error: null };
  } catch (err) {
    const message = errorMessage(err);
    log.error("run.failed", { error: message, stage: stats.stage });
    await updateRun(run.id, {
      status: "failed",
      error: message.slice(0, 1000),
      finished_at: new Date().toISOString(),
      stats: mergeStats(stats, { timingsMs: { total: elapsed() } }),
    }).catch(() => {});
    return { runId: run.id, status: "failed", reportId: null, stats, error: message };
  }
}
