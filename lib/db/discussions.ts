// Discussions (what authors wrote) and their analysis (what the model
// inferred). The two live in separate tables on purpose.

import { MAX_ANALYSIS_ATTEMPTS } from "@/lib/config";
import type { CollectedDiscussion, SourceId } from "@/lib/sources/types";
import { normalizeUrl } from "@/lib/text";
import { check, getDb, selectAll } from "./client";
import type { AnalysisRow, DiscussionRow, PainPointRow, TopicRow } from "./types";

// ---------------------------------------------------------------------
// Ingestion
// ---------------------------------------------------------------------

/**
 * Store collected discussions idempotently. Returns new/duplicate counts per source.
 * Precondition: items are unique per (source, external id) — callers pass the
 * output of dedupeDiscussions(), which merges in-batch duplicates first.
 */
export async function ingestDiscussions(
  runId: string,
  items: CollectedDiscussion[],
): Promise<Record<string, { inserted: number; duplicates: number }>> {
  const db = getDb();
  const totals: Record<string, { inserted: number; duplicates: number }> = {};
  const sent: Record<string, number> = {};
  for (const d of items) sent[d.sourceId] = (sent[d.sourceId] ?? 0) + 1;

  for (let i = 0; i < items.length; i += 200) {
    const chunk = items.slice(i, i + 200).map((d) => ({ ...d, urlNormalized: normalizeUrl(d.url) }));
    const res = await db.rpc("ingest_discussions", { p_run_id: runId, p_items: chunk });
    const rows = check(res, "Could not store discussions") as {
      out_source_id: string;
      out_inserted: number;
      out_duplicates: number;
    }[];
    for (const r of rows) {
      totals[r.out_source_id] ??= { inserted: 0, duplicates: 0 };
      totals[r.out_source_id].inserted += r.out_inserted;
    }
  }
  // Everything sent that was not newly inserted is a duplicate of something already stored.
  for (const [source, n] of Object.entries(sent)) {
    totals[source] ??= { inserted: 0, duplicates: 0 };
    totals[source].duplicates = n - totals[source].inserted;
  }
  return totals;
}

// ---------------------------------------------------------------------
// Analysis queue
// ---------------------------------------------------------------------

/** Discussions waiting for analysis (new, or failed fewer than MAX attempts), newest first. */
export async function getAnalysisQueue(limit: number): Promise<DiscussionRow[]> {
  const res = await getDb()
    .from("discussions")
    .select("*")
    .in("analysis_status", ["pending", "failed"])
    .lt("analysis_attempts", MAX_ANALYSIS_ATTEMPTS)
    .eq("is_excluded", false)
    .order("published_at", { ascending: false })
    .limit(limit);
  return check(res, "Could not load analysis queue") as DiscussionRow[];
}

export async function countAnalysisQueue(): Promise<{ pending: number; failed: number }> {
  const db = getDb();
  const [p, f] = await Promise.all([
    db.from("discussions").select("id", { count: "exact", head: true }).eq("analysis_status", "pending").eq("is_excluded", false),
    db.from("discussions").select("id", { count: "exact", head: true }).eq("analysis_status", "failed").eq("is_excluded", false),
  ]);
  return { pending: p.count ?? 0, failed: f.count ?? 0 };
}

/** Allow failed discussions to be retried again (manual "reprocess"). */
export async function resetFailedAnalysis(): Promise<number> {
  const res = await getDb()
    .from("discussions")
    .update({ analysis_status: "pending", analysis_attempts: 0, analysis_error: null })
    .eq("analysis_status", "failed")
    .select("id");
  return (check(res, "Could not reset failed analysis") ?? []).length;
}

export async function saveAnalyses(rows: Omit<AnalysisRow, "analyzed_at">[]) {
  if (!rows.length) return;
  const db = getDb();
  check(await db.from("discussion_analysis").upsert(rows, { onConflict: "discussion_id" }), "Could not save analysis");
  const relevant = rows.filter((r) => r.is_relevant).map((r) => r.discussion_id);
  const irrelevant = rows.filter((r) => !r.is_relevant).map((r) => r.discussion_id);
  for (const [ids, status] of [
    [relevant, "analyzed"],
    [irrelevant, "irrelevant"],
  ] as const) {
    if (!ids.length) continue;
    check(
      await db.from("discussions").update({ analysis_status: status, analysis_error: null }).in("id", ids),
      "Could not update analysis status",
    );
  }
}

/** Record a failed attempt; after MAX attempts the row stays "failed" until reprocessed. */
export async function markAnalysisFailed(items: Pick<DiscussionRow, "id" | "analysis_attempts">[], error: string) {
  const db = getDb();
  // Group by current attempts so each group is one update.
  const groups = new Map<number, string[]>();
  for (const d of items) groups.set(d.analysis_attempts, [...(groups.get(d.analysis_attempts) ?? []), d.id]);
  for (const [attempts, ids] of groups) {
    check(
      await db
        .from("discussions")
        .update({ analysis_status: "failed", analysis_attempts: attempts + 1, analysis_error: error.slice(0, 500) })
        .in("id", ids),
      "Could not record analysis failure",
    );
  }
}

export async function bumpAttempts(items: Pick<DiscussionRow, "id" | "analysis_attempts">[]) {
  const db = getDb();
  const groups = new Map<number, string[]>();
  for (const d of items) groups.set(d.analysis_attempts, [...(groups.get(d.analysis_attempts) ?? []), d.id]);
  for (const [attempts, ids] of groups) {
    check(await db.from("discussions").update({ analysis_attempts: attempts + 1 }).in("id", ids), "Could not update attempts");
  }
}

export async function assignPainPoint(discussionIds: string[], painPointId: string) {
  if (!discussionIds.length) return;
  check(
    await getDb().from("discussion_analysis").update({ pain_point_id: painPointId }).in("discussion_id", discussionIds),
    "Could not link discussions to pain point",
  );
}

// ---------------------------------------------------------------------
// Reading for analytics
// ---------------------------------------------------------------------

/** One analysed or unanalysed discussion, flattened for metric computation. */
export type MetricRow = {
  id: string;
  sourceId: SourceId;
  publishedAt: string;
  firstRetrievedAt: string;
  status: DiscussionRow["analysis_status"];
  excluded: boolean;
  score: number;
  commentCount: number;
  relevant: boolean | null;
  topicId: string | null;
  painPointId: string | null;
  isUnresolved: boolean | null;
  toolDissatisfaction: boolean | null;
  severity: number | null;
};

type JoinedRow = Pick<
  DiscussionRow,
  "id" | "source_id" | "published_at" | "first_retrieved_at" | "analysis_status" | "is_excluded" | "score" | "comment_count"
> & {
  analysis: Pick<
    AnalysisRow,
    "is_relevant" | "topic_id" | "pain_point_id" | "is_unresolved" | "tool_dissatisfaction" | "severity"
  > | null;
};

export async function loadMetricRows(since: Date, until: Date): Promise<MetricRow[]> {
  const db = getDb();
  const rows = await selectAll<JoinedRow>(
    (from, to) =>
      db
        .from("discussions")
        .select(
          "id, source_id, published_at, first_retrieved_at, analysis_status, is_excluded, score, comment_count, " +
            "analysis:discussion_analysis(is_relevant, topic_id, pain_point_id, is_unresolved, tool_dissatisfaction, severity)",
        )
        .gte("published_at", since.toISOString())
        .lt("published_at", until.toISOString())
        .order("published_at", { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: JoinedRow[] | null; error: { message: string } | null }>,
    "Could not load discussions for metrics",
  );
  return rows.map((r) => ({
    id: r.id,
    sourceId: r.source_id as SourceId,
    publishedAt: r.published_at,
    firstRetrievedAt: r.first_retrieved_at,
    status: r.analysis_status,
    excluded: r.is_excluded,
    score: r.score ?? 0,
    commentCount: r.comment_count ?? 0,
    relevant: r.analysis?.is_relevant ?? null,
    topicId: r.analysis?.topic_id ?? null,
    painPointId: r.analysis?.pain_point_id ?? null,
    isUnresolved: r.analysis?.is_unresolved ?? null,
    toolDissatisfaction: r.analysis?.tool_dissatisfaction ?? null,
    severity: r.analysis?.severity ?? null,
  }));
}

/** Analysed, non-excluded discussions for the given pain points in a time range (brief evidence). */
export async function loadEvidenceCandidates(painPointIds: string[], since: Date, until: Date) {
  if (!painPointIds.length) return [];
  const res = await getDb()
    .from("discussions")
    .select(
      "id, source_id, title, published_at, score, comment_count, " +
        "analysis:discussion_analysis!inner(pain_point_id, problem_summary, evidence_quote, quote_verified, unresolved_evidence, workaround, tools_mentioned, tool_dissatisfaction, severity)",
    )
    .eq("is_excluded", false)
    .eq("analysis_status", "analyzed")
    .in("analysis.pain_point_id", painPointIds.slice(0, 200))
    .gte("published_at", since.toISOString())
    .lt("published_at", until.toISOString())
    .limit(2000);
  return check(res, "Could not load evidence candidates") as unknown as (Pick<
    DiscussionRow,
    "id" | "source_id" | "title" | "published_at" | "score" | "comment_count"
  > & {
    analysis: Pick<
      AnalysisRow,
      | "pain_point_id"
      | "problem_summary"
      | "evidence_quote"
      | "quote_verified"
      | "unresolved_evidence"
      | "workaround"
      | "tools_mentioned"
      | "tool_dissatisfaction"
      | "severity"
    >;
  })[];
}

// ---------------------------------------------------------------------
// Source Explorer
// ---------------------------------------------------------------------

export type DiscussionWithAnalysis = DiscussionRow & {
  analysis:
    | (AnalysisRow & {
        topic: Pick<TopicRow, "id" | "name"> | null;
        pain_point: Pick<PainPointRow, "id" | "title"> | null;
      })
    | null;
};

export type ExplorerFilters = {
  q?: string;
  source?: string;
  topic?: string;
  painPoint?: string;
  status?: "relevant" | "irrelevant" | "pending" | "excluded" | "all";
  from?: string; // ISO
  to?: string; // ISO
  sort?: "recent" | "engagement" | "oldest";
  page?: number;
};

export const EXPLORER_PAGE_SIZE = 25;

export async function searchDiscussions(f: ExplorerFilters): Promise<{ rows: DiscussionWithAnalysis[]; total: number }> {
  const db = getDb();
  // !inner when filtering on the analysis so non-matching discussions are excluded.
  const needsInner = Boolean(f.topic || f.painPoint || f.status === "relevant");
  const analysisSel = `analysis:discussion_analysis${needsInner ? "!inner" : ""}(*, topic:topics(id, name), pain_point:pain_points(id, title))`;
  let q = db.from("discussions").select(`*, ${analysisSel}`, { count: "exact" });

  if (f.q) {
    const term = f.q.replace(/[%_,()]/g, " ").trim().slice(0, 100);
    if (term) q = q.or(`title.ilike.%${term}%,excerpt.ilike.%${term}%`);
  }
  if (f.source) q = q.eq("source_id", f.source);
  if (f.topic) q = q.eq("analysis.topic_id", f.topic);
  if (f.painPoint) q = q.eq("analysis.pain_point_id", f.painPoint);
  if (f.from) q = q.gte("published_at", f.from);
  if (f.to) q = q.lt("published_at", f.to);

  switch (f.status ?? "relevant") {
    case "relevant":
      q = q.eq("analysis_status", "analyzed").eq("is_excluded", false);
      break;
    case "irrelevant":
      q = q.eq("analysis_status", "irrelevant").eq("is_excluded", false);
      break;
    case "pending":
      q = q.in("analysis_status", ["pending", "failed"]).eq("is_excluded", false);
      break;
    case "excluded":
      q = q.eq("is_excluded", true);
      break;
  }

  if (f.sort === "engagement") q = q.order("score", { ascending: false, nullsFirst: false }).order("comment_count", { ascending: false });
  else q = q.order("published_at", { ascending: f.sort === "oldest" });

  const page = Math.max(1, f.page ?? 1);
  q = q.range((page - 1) * EXPLORER_PAGE_SIZE, page * EXPLORER_PAGE_SIZE - 1);
  const res = await q;
  const rows = check(res, "Could not search discussions") as unknown as DiscussionWithAnalysis[];
  return { rows, total: res.count ?? rows.length };
}

export async function getDiscussion(id: string): Promise<DiscussionWithAnalysis | null> {
  const res = await getDb()
    .from("discussions")
    .select("*, analysis:discussion_analysis(*, topic:topics(id, name), pain_point:pain_points(id, title))")
    .eq("id", id)
    .maybeSingle();
  return check(res, "Could not load discussion") as unknown as DiscussionWithAnalysis | null;
}

/** Other discussions assigned to the same pain point (recurrence evidence). */
export async function getRelatedDiscussions(painPointId: string, excludeId: string, limit = 8) {
  const res = await getDb()
    .from("discussion_analysis")
    .select("discussion:discussions!inner(id, title, url, source_id, published_at, is_excluded)")
    .eq("pain_point_id", painPointId)
    .neq("discussion_id", excludeId)
    .eq("discussion.is_excluded", false)
    .limit(limit);
  const rows = check(res, "Could not load related discussions") as unknown as {
    discussion: Pick<DiscussionRow, "id" | "title" | "url" | "source_id" | "published_at">;
  }[];
  return rows.map((r) => r.discussion).sort((a, b) => b.published_at.localeCompare(a.published_at));
}

export async function setExcluded(id: string, excluded: boolean, reason: string | null) {
  check(
    await getDb()
      .from("discussions")
      .update({
        is_excluded: excluded,
        exclusion_reason: excluded ? reason : null,
        excluded_at: excluded ? new Date().toISOString() : null,
      })
      .eq("id", id),
    "Could not update exclusion",
  );
}

/** Discussions by id (for evidence rendering). Excluded ones are returned too, flagged. */
export async function getDiscussionsByIds(ids: string[]) {
  if (!ids.length) return [];
  const res = await getDb()
    .from("discussions")
    .select("id, title, url, source_id, author, published_at, score, comment_count, excerpt, is_excluded, analysis:discussion_analysis(problem_summary, evidence_quote, quote_verified, pain_point_id)")
    .in("id", ids.slice(0, 500));
  return check(res, "Could not load evidence") as unknown as (Pick<
    DiscussionRow,
    "id" | "title" | "url" | "source_id" | "author" | "published_at" | "score" | "comment_count" | "excerpt" | "is_excluded"
  > & { analysis: Pick<AnalysisRow, "problem_summary" | "evidence_quote" | "quote_verified" | "pain_point_id"> | null })[];
}
