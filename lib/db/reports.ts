// Reports are immutable snapshots: the deterministic metrics, the validated
// brief, per-pain-point numbers and evidence links are stored at generation
// time, so old reports can be re-read and compared without recomputation.

import type { ReportMetrics } from "@/lib/analytics/metrics";
import type { BriefValidation, StoredBrief } from "@/lib/ai/brief";
import { check, getDb } from "./client";
import type { ReportRow, Trigger } from "./types";

export type Report = Omit<ReportRow, "metrics" | "brief" | "validation"> & {
  metrics: ReportMetrics;
  brief: StoredBrief | null;
  validation: Partial<BriefValidation> & { stage?: string };
};

export type ReportPainPointRow = {
  report_id: string;
  pain_point_id: string;
  title: string;
  topic_id: string | null;
  topic_name: string | null;
  current_count: number;
  previous_count: number;
  abs_change: number;
  pct_change: number | null;
  trend_status: string;
  unresolved_count: number;
  source_count: number;
  periods_present: number;
  signal_score: number;
  signal_components: Record<string, number>;
  rank: number;
};

export async function createReport(input: {
  runId: string | null;
  trigger: Trigger;
  metrics: ReportMetrics;
  pipelineVersion: string;
  model: string | null;
  promptVersion: string;
}): Promise<string> {
  const m = input.metrics;
  const res = await getDb()
    .from("reports")
    .insert({
      run_id: input.runId,
      trigger: input.trigger,
      status: "generating",
      timezone: m.timezone,
      period_start: m.current.start,
      period_end: m.current.end,
      prev_period_start: m.previous.start,
      prev_period_end: m.previous.end,
      metrics: m,
      model: input.model,
      prompt_version: input.promptVersion,
      pipeline_version: input.pipelineVersion,
      email_status: "not_configured",
    })
    .select("id")
    .single();
  return (check(res, "Could not create report") as { id: string }).id;
}

export async function savePainPointSnapshot(reportId: string, metrics: ReportMetrics) {
  if (!metrics.painPoints.length) return;
  const rows = metrics.painPoints.map((p) => ({
    report_id: reportId,
    pain_point_id: p.painPointId,
    title: p.title,
    topic_id: p.topicId,
    topic_name: p.topicName,
    current_count: p.current,
    previous_count: p.previous,
    abs_change: p.absChange,
    pct_change: p.pctChange,
    trend_status: p.status,
    unresolved_count: p.unresolvedCurrent,
    source_count: p.sourcesAll.length,
    periods_present: p.periodsPresent,
    signal_score: p.signalScore,
    signal_components: p.signal,
    rank: p.rank,
  }));
  check(await getDb().from("report_pain_points").upsert(rows, { onConflict: "report_id,pain_point_id" }), "Could not save report snapshot");
}

export async function saveEvidence(
  reportId: string,
  citations: { discussionId: string; painPointId: string | null; claimRef: string }[],
) {
  if (!citations.length) return;
  const unique = new Map(citations.map((c) => [`${c.discussionId}|${c.claimRef}`, c]));
  const rows = [...unique.values()].map((c) => ({
    report_id: reportId,
    discussion_id: c.discussionId,
    pain_point_id: c.painPointId,
    claim_ref: c.claimRef,
  }));
  check(
    await getDb().from("report_evidence").upsert(rows, { onConflict: "report_id,discussion_id,claim_ref", ignoreDuplicates: true }),
    "Could not save report evidence",
  );
}

export async function updateReport(id: string, patch: Record<string, unknown>) {
  check(await getDb().from("reports").update(patch).eq("id", id), "Could not update report");
}

const LIST_COLUMNS =
  "id, run_id, trigger, status, timezone, period_start, period_end, prev_period_start, prev_period_end, model, prompt_version, pipeline_version, error, email_status, emailed_at, created_at, completed_at";

export type ReportListItem = Omit<Report, "metrics" | "brief" | "validation" | "email_provider_id" | "email_error">;

export async function listReports(limit = 50): Promise<ReportListItem[]> {
  const res = await getDb().from("reports").select(LIST_COLUMNS).order("created_at", { ascending: false }).limit(limit);
  return check(res, "Could not load reports") as unknown as ReportListItem[];
}

export async function getReport(id: string): Promise<Report | null> {
  const res = await getDb().from("reports").select("*").eq("id", id).maybeSingle();
  return check(res, "Could not load report") as Report | null;
}

/** The most recent report whose AI brief succeeded. */
export async function getLatestReport(): Promise<Report | null> {
  const res = await getDb()
    .from("reports")
    .select("*")
    .eq("status", "succeeded")
    .order("period_end", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return check(res, "Could not load latest report") as Report | null;
}

export async function getReportPainPoints(reportId: string): Promise<ReportPainPointRow[]> {
  const res = await getDb().from("report_pain_points").select("*").eq("report_id", reportId).order("rank");
  return check(res, "Could not load report pain points") as ReportPainPointRow[];
}

export async function getReportEvidence(reportId: string) {
  const res = await getDb()
    .from("report_evidence")
    .select("discussion_id, pain_point_id, claim_ref")
    .eq("report_id", reportId);
  return check(res, "Could not load report evidence") as { discussion_id: string; pain_point_id: string | null; claim_ref: string }[];
}

/** Reports that cited a pain point — for the evidence graph on the pain point page. */
export async function reportsCitingPainPoint(painPointId: string) {
  const res = await getDb()
    .from("report_pain_points")
    .select("report_id, rank, signal_score, current_count, previous_count, trend_status, report:reports!inner(id, period_start, period_end, status, timezone)")
    .eq("pain_point_id", painPointId)
    .order("report_id");
  return check(res, "Could not load report history") as unknown as {
    report_id: string;
    rank: number;
    signal_score: number;
    current_count: number;
    previous_count: number;
    trend_status: string;
    report: { id: string; period_start: string; period_end: string; status: string; timezone: string };
  }[];
}
