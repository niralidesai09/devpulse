// Collection stage: active config → live sources → dedupe → idempotent store.

import { LOOKBACK_WEEKS, REPORT_TIMEZONE, REPORT_WEEK_END_DAY } from "@/lib/config";
import type { ActiveConfig } from "@/lib/db/config";
import { ingestDiscussions } from "@/lib/db/discussions";
import { saveSourceRuns } from "@/lib/db/runs";
import type { Logger } from "@/lib/log";
import { collect } from "@/lib/sources";
import { latestCompletePeriod, periodSeries } from "@/lib/time/periods";

/**
 * Publication window for a collection: the start of the oldest of the last
 * LOOKBACK_WEEKS complete reporting weeks, up to now. Re-collecting weeks
 * that were already collected is safe (idempotent) and refreshes engagement.
 */
export function collectionWindow(now: Date): { start: Date; end: Date } {
  const latest = latestCompletePeriod(now, REPORT_TIMEZONE, REPORT_WEEK_END_DAY);
  const series = periodSeries(latest, LOOKBACK_WEEKS, REPORT_TIMEZONE);
  return { start: series[0].start, end: now };
}

export async function runCollection(runId: string, config: ActiveConfig, log: Logger, now = new Date()) {
  const window = collectionWindow(now);
  log.info("collect.start", { sources: config.sourceIds, topics: config.topics.length, keywords: config.keywords.length });

  const out = await collect(config.sourceIds, {
    topics: config.topics,
    keywords: config.keywords,
    since: window.start,
    until: window.end,
  });

  // Store first, then record per-source status (with the new/duplicate split).
  const stored = await ingestDiscussions(runId, out.discussions);
  const perSourceUnique = new Map<string, number>();
  for (const d of out.discussions) perSourceUnique.set(d.sourceId, (perSourceUnique.get(d.sourceId) ?? 0) + 1);

  await saveSourceRuns(
    runId,
    window,
    out.outcomes.map((o) => ({
      ...o,
      newCount: stored[o.sourceId]?.inserted ?? 0,
      duplicateCount: stored[o.sourceId]?.duplicates ?? 0,
    })),
  );

  const inserted = Object.values(stored).reduce((a, s) => a + s.inserted, 0);
  const alreadyStored = Object.values(stored).reduce((a, s) => a + s.duplicates, 0);
  for (const o of out.outcomes) {
    log.info("collect.source", {
      source: o.sourceId,
      status: o.status,
      fetched: o.discussions.length,
      requests: o.requests,
      failedRequests: o.failedRequests,
      truncated: o.truncated,
      ms: o.durationMs,
      error: o.error,
    });
  }

  return {
    window,
    outcomes: out.outcomes,
    fetched: out.outcomes.reduce((a, o) => a + o.discussions.length, 0),
    uniqueInRun: out.discussions.length,
    duplicatesWithinRun: out.duplicatesWithinRun,
    inserted,
    alreadyStored,
    allFailed: out.outcomes.length > 0 && out.outcomes.every((o) => o.status === "failed"),
    anyDegraded: out.outcomes.some((o) => o.status !== "succeeded"),
  };
}
