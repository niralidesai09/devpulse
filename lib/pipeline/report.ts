// Report stage: deterministic metrics → snapshot → Gemini brief (grounded)
// → evidence links → optional email. The report row is created BEFORE the
// model is called, so a model failure still leaves the computed metrics
// visible and the report can be regenerated.

import { BRIEF_PROMPT_VERSION, generateBrief, type EvidenceItem, type EvidencePack } from "@/lib/ai/brief";
import { getModel, isGeminiConfigured } from "@/lib/ai/gemini";
import { computeReportMetrics, type ReportMetrics } from "@/lib/analytics/metrics";
import { PIPELINE_VERSION, REPORT_TIMEZONE, REPORT_WEEK_END_DAY } from "@/lib/config";
import { listSources, listTopics } from "@/lib/db/config";
import { getDiscussionsByIds, loadEvidenceCandidates, loadMetricRows } from "@/lib/db/discussions";
import { latestDecisions, listPainPoints } from "@/lib/db/painPoints";
import { createReport, saveEvidence, savePainPointSnapshot, updateReport } from "@/lib/db/reports";
import { listUsableSourceRuns } from "@/lib/db/runs";
import type { Trigger } from "@/lib/db/types";
import { isEmailConfigured, renderBriefEmail, sendBriefEmail } from "@/lib/email/sendBrief";
import { errorMessage, type Logger } from "@/lib/log";
import { latestCompletePeriod, partialPeriod, periodSeries } from "@/lib/time/periods";

const SERIES_WEEKS = 4;
const PACK_PAIN_POINTS = 10;
const EVIDENCE_PER_PAIN_POINT = 4;

export function appUrl(): string | null {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return null;
}

/** Compute metrics for the latest complete week from what is stored right now. */
export async function computeCurrentMetrics(now = new Date()): Promise<ReportMetrics> {
  const latest = latestCompletePeriod(now, REPORT_TIMEZONE, REPORT_WEEK_END_DAY);
  const series = periodSeries(latest, SERIES_WEEKS, REPORT_TIMEZONE);
  const partial = partialPeriod(now, REPORT_TIMEZONE, REPORT_WEEK_END_DAY);
  const [rows, painPoints, topics, sources, sourceRuns] = await Promise.all([
    loadMetricRows(series[0].start, now),
    listPainPoints(),
    listTopics({ includeArchived: true }),
    listSources(),
    listUsableSourceRuns(series[0].start),
  ]);
  return computeReportMetrics({
    rows,
    series,
    partial: partial.start.getTime() < now.getTime() ? partial : null,
    painPoints: new Map(painPoints.map((p) => [p.id, { title: p.title, topicId: p.topic_id }])),
    topics: new Map(topics.filter((t) => !t.archived_at).map((t) => [t.id, { name: t.name }])),
    sourceRuns,
    enabledSources: sources.filter((s) => s.is_enabled).map((s) => s.id),
    timezone: REPORT_TIMEZONE,
    now,
  });
}

async function buildEvidencePack(metrics: ReportMetrics): Promise<EvidencePack> {
  const [painPoints, decisions] = await Promise.all([listPainPoints(), latestDecisions()]);
  const desc = new Map(painPoints.map((p) => [p.id, p.description]));
  const chosen = metrics.painPoints.filter((p) => p.current > 0 || p.status === "gone").slice(0, PACK_PAIN_POINTS);
  const candidates = await loadEvidenceCandidates(
    chosen.map((p) => p.painPointId),
    new Date(metrics.previous.start),
    new Date(metrics.current.end),
  );
  const curStart = new Date(metrics.current.start).getTime();

  const evidence: EvidenceItem[] = [];
  for (const p of chosen) {
    const mine = candidates
      .filter((c) => c.analysis.pain_point_id === p.painPointId)
      .map((c) => ({ c, period: (new Date(c.published_at).getTime() >= curStart ? "current" : "previous") as "current" | "previous" }))
      // current week first, verified quotes first, then engagement
      .sort(
        (a, b) =>
          Number(b.period === "current") - Number(a.period === "current") ||
          Number(b.c.analysis.quote_verified) - Number(a.c.analysis.quote_verified) ||
          (b.c.score ?? 0) + (b.c.comment_count ?? 0) - ((a.c.score ?? 0) + (a.c.comment_count ?? 0)),
      )
      .slice(0, EVIDENCE_PER_PAIN_POINT);
    for (const { c, period } of mine) {
      evidence.push({
        discussionId: c.id,
        painPointId: p.painPointId,
        sourceId: c.source_id,
        publishedAt: c.published_at,
        title: c.title,
        summary: c.analysis.problem_summary,
        quote: c.analysis.quote_verified ? c.analysis.evidence_quote : null,
        unresolvedEvidence: c.analysis.unresolved_evidence,
        workaround: c.analysis.workaround,
        tools: c.analysis.tools_mentioned ?? [],
        dissatisfied: c.analysis.tool_dissatisfaction,
        period,
      });
    }
  }
  return {
    painPoints: chosen.map((p) => ({
      ...p,
      description: desc.get(p.painPointId) ?? "",
      decision: decisions.get(p.painPointId)?.decision ?? null,
    })),
    evidence,
  };
}

export async function generateReport(input: { runId: string | null; trigger: Trigger; log: Logger; sendEmail?: boolean }) {
  const { log } = input;
  const metrics = await computeCurrentMetrics();
  const model = isGeminiConfigured() ? getModel() : null;
  const reportId = await createReport({
    runId: input.runId,
    trigger: input.trigger,
    metrics,
    pipelineVersion: PIPELINE_VERSION,
    model,
    promptVersion: BRIEF_PROMPT_VERSION,
  });
  const rlog = log.child({ reportId });
  await savePainPointSnapshot(reportId, metrics);
  rlog.info("report.metrics", {
    period: metrics.current.label,
    relevant: metrics.totals.current.relevant,
    painPoints: metrics.painPoints.length,
    sufficientForTrend: metrics.quality.sufficientForTrend,
  });

  try {
    if (metrics.totals.current.relevant === 0) {
      throw new Error(
        "No relevant discussions are stored for this reporting week yet, so there is no evidence to write a brief from. Run a collection first.",
      );
    }
    const pack = await buildEvidencePack(metrics);
    const { brief, validation, citations } = await generateBrief(metrics, pack);
    await saveEvidence(reportId, citations);
    await updateReport(reportId, {
      status: "succeeded",
      brief,
      validation,
      completed_at: new Date().toISOString(),
      email_status: isEmailConfigured() && input.sendEmail !== false ? "pending" : isEmailConfigured() ? "skipped" : "not_configured",
    });
    rlog.info("report.brief", { citations: citations.length, dropped: validation.droppedItems.length, numericWarnings: validation.numericWarnings.length });

    if (isEmailConfigured() && input.sendEmail !== false) {
      const ids = [...new Set(citations.map((c) => c.discussionId))];
      const docs = await getDiscussionsByIds(ids);
      const links = new Map(docs.map((d) => [d.id, { title: d.title, url: d.url, source: d.source_id }]));
      const base = appUrl();
      const email = renderBriefEmail({
        reportUrl: base ? `${base}/reports/${reportId}` : null,
        metrics,
        brief,
        links,
        painPointTitles: new Map(metrics.painPoints.map((p) => [p.painPointId, p.title])),
      });
      const sent = await sendBriefEmail(email);
      await updateReport(
        reportId,
        sent.ok
          ? { email_status: "sent", email_provider_id: sent.id, emailed_at: new Date().toISOString(), email_error: null }
          : { email_status: "failed", email_error: sent.error.slice(0, 500) },
      );
      rlog[sent.ok ? "info" : "warn"]("report.email", sent.ok ? { providerId: sent.id } : { error: sent.error });
    }
    return { reportId, status: "succeeded" as const, error: null };
  } catch (err) {
    const message = errorMessage(err);
    await updateReport(reportId, { status: "failed", error: message.slice(0, 1000), completed_at: new Date().toISOString() });
    rlog.error("report.failed", { error: message });
    return { reportId, status: "failed" as const, error: message };
  }
}
