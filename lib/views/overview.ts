// Data for the Overview page. Uses the latest report's stored snapshot when
// it covers the latest complete week (so numbers match the brief exactly);
// otherwise computes the metrics live from stored data.

import type { ReportMetrics } from "@/lib/analytics/metrics";
import { REPORT_TIMEZONE, REPORT_WEEK_END_DAY } from "@/lib/config";
import { getDiscussionsByIds } from "@/lib/db/discussions";
import { latestDecisions } from "@/lib/db/painPoints";
import { getLatestReport, type Report } from "@/lib/db/reports";
import { getRunningRun, listRuns } from "@/lib/db/runs";
import { computeCurrentMetrics } from "@/lib/pipeline/report";
import { latestCompletePeriod } from "@/lib/time/periods";

export type EvidenceDoc = Awaited<ReturnType<typeof getDiscussionsByIds>>[number];

export async function loadOverview() {
  const now = new Date();
  const latestPeriod = latestCompletePeriod(now, REPORT_TIMEZONE, REPORT_WEEK_END_DAY);
  const [report, runs, running, decisions] = await Promise.all([getLatestReport(), listRuns(15), getRunningRun(), latestDecisions()]);

  const reportIsCurrent = Boolean(report && new Date(report.period_end).getTime() === latestPeriod.end.getTime());
  const metrics: ReportMetrics = reportIsCurrent ? report!.metrics : await computeCurrentMetrics(now);

  const citedIds = report?.brief
    ? [
        ...new Set([
          ...report.brief.executive_summary.flatMap((x) => x.evidence),
          ...report.brief.recommendations.flatMap((x) => x.evidence),
          ...report.brief.opportunities.flatMap((x) => x.evidence),
        ]),
      ]
    : [];
  const evidence = new Map((await getDiscussionsByIds(citedIds)).map((d) => [d.id, d]));

  const lastGood = runs.find((r) => r.status === "succeeded" || r.status === "partial") ?? null;
  return {
    metrics,
    metricsSource: reportIsCurrent ? ("report" as const) : ("live" as const),
    report: report as Report | null,
    reportIsCurrent,
    evidence,
    lastRun: runs[0] ?? null,
    lastGoodRun: lastGood,
    running,
    decisions,
  };
}
