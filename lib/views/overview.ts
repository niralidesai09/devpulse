// Data for the Overview. Uses the latest report's stored snapshot when it
// covers the latest complete week (so numbers match the brief exactly);
// otherwise computes the metrics live from stored data.

import type { ReportMetrics } from "@/lib/analytics/metrics";
import { REPORT_TIMEZONE, REPORT_WEEK_END_DAY } from "@/lib/config";
import { listSources } from "@/lib/db/config";
import { getDiscussionsByIds } from "@/lib/db/discussions";
import { latestDecisions, listPainPoints } from "@/lib/db/painPoints";
import { getLatestReport, type Report } from "@/lib/db/reports";
import { getRunningRun, listRuns } from "@/lib/db/runs";
import type { SourceRunRow } from "@/lib/db/types";
import { computeCurrentMetrics } from "@/lib/pipeline/report";
import { latestCompletePeriod } from "@/lib/time/periods";

export type EvidenceDoc = Awaited<ReturnType<typeof getDiscussionsByIds>>[number];

export type DataState = { key: "current" | "stale" | "incomplete" | "unavailable"; label: string; detail: string };

export async function loadOverview() {
  const now = new Date();
  const latestPeriod = latestCompletePeriod(now, REPORT_TIMEZONE, REPORT_WEEK_END_DAY);
  const [report, runs, running, decisions, painPoints, sources] = await Promise.all([
    getLatestReport(),
    listRuns(15),
    getRunningRun(),
    latestDecisions(),
    listPainPoints(),
    listSources(),
  ]);

  const reportIsCurrent = Boolean(report && new Date(report.period_end).getTime() === latestPeriod.end.getTime());
  const metrics: ReportMetrics = reportIsCurrent ? report!.metrics : await computeCurrentMetrics(now);

  const citedIds = report?.brief
    ? [
        ...new Set([
          ...report.brief.executive_summary.flatMap((x) => x.evidence),
          ...report.brief.notable_changes.flatMap((x) => x.evidence),
          ...report.brief.recommendations.flatMap((x) => x.evidence),
          ...report.brief.opportunities.flatMap((x) => x.evidence),
        ]),
      ]
    : [];
  const evidence = new Map((await getDiscussionsByIds(citedIds)).map((d) => [d.id, d]));

  const lastGoodRun = runs.find((r) => r.status === "succeeded" || r.status === "partial") ?? null;
  const lastRun = runs.find((r) => r.status !== "running") ?? null;

  // Latest result per enabled source.
  const latestBySource = new Map<string, SourceRunRow>();
  for (const r of runs) for (const s of r.source_runs) if (!latestBySource.has(s.source_id)) latestBySource.set(s.source_id, s);

  // Is the data current, stale, incomplete or unavailable?
  let dataState: DataState;
  if (!lastGoodRun) dataState = { key: "unavailable", label: "No data yet", detail: "No collection has completed yet." };
  else if (now.getTime() - new Date(lastGoodRun.finished_at ?? lastGoodRun.started_at).getTime() > 8 * 86_400_000)
    dataState = { key: "stale", label: "Stale", detail: "The last successful collection is more than a week old." };
  else if (!metrics.quality.sufficientForTrend || metrics.excludedFromComparison.length)
    dataState = { key: "incomplete", label: "Partial coverage", detail: "Some sources are not comparable week on week; see the note under the summary." };
  else dataState = { key: "current", label: "Up to date", detail: "All enabled sources were collected for both weeks." };

  return {
    metrics,
    metricsSource: reportIsCurrent ? ("report" as const) : ("live" as const),
    report: report as Report | null,
    reportIsCurrent,
    evidence,
    lastRun,
    lastGoodRun,
    running,
    decisions,
    descriptions: new Map(painPoints.map((p) => [p.id, p.description])),
    sources: sources.map((s) => ({ ...s, latest: latestBySource.get(s.id) ?? null })),
    dataState,
  };
}
