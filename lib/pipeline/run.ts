// runPipeline(): ONE complete weekly run.
//
//   1. Create a "runs" row (status = running)
//   2. Load active topics from Supabase
//   3. Collect live posts from all 4 sources (last 7 days)
//   4. In parallel:  a) Gemini classifies the posts
//                    b) Smart baseline counts HN keyword matches for this week + last week
//   5. Save the relevant posts
//   6. Compute topic_stats (mentions, trend, unresolved %, Opportunity Score) and save
//   7. Emerging Topic Radar: posts no topic fits -> suggested new topics
//   8. Gemini writes the Friday brief -> save it -> email it with Resend
//   9. Mark the run success / partial / failed, with per-source status
//
// A failed brief or email does NOT lose the data: the run becomes "partial"
// and the brief can be re-written / re-sent later.

import { classifyPosts, type ClassifiedPost } from "@/lib/ai/classify";
import { getModel } from "@/lib/ai/gemini";
import { createServerClient } from "@/lib/db/supabase";
import { getActiveTopics } from "@/lib/db/topics";
import { sendBriefEmail } from "@/lib/email/brief-email";
import { collectAll } from "@/lib/sources";
import { countBaseline } from "./baseline";
import { createBrief } from "./brief";
import { runEmergingTopicRadar } from "./radar";
import { computeTopicStats, type PreviousRun, type TopicStat } from "./scoring";

// A run that is still "running" after this long was killed (e.g. by the
// Vercel time limit) and will never finish, so we mark it failed.
const STALE_RUN_MINUTES = 15;

export type PipelineSummary = {
  runId: string;
  status: "success" | "partial" | "failed";
  stats: Record<string, unknown>;
  topicStats: TopicStat[];
  error?: string;
};

/** Fail old stuck runs, and refuse to start if another run is in progress. */
async function guardAgainstParallelRuns() {
  const supabase = createServerClient();
  const staleBefore = new Date(Date.now() - STALE_RUN_MINUTES * 60_000).toISOString();

  await supabase
    .from("runs")
    .update({ status: "failed", finished_at: new Date().toISOString(), error: "Timed out (never finished)" })
    .eq("status", "running")
    .lt("started_at", staleBefore);

  const { data } = await supabase.from("runs").select("id").eq("status", "running").limit(1);
  if (data?.length) throw new Error("Another run is already in progress. Try again in a few minutes.");
}

/**
 * "success" only if EVERY source fully worked and every later step worked.
 * A source with some failed requests ("partial") makes the run "partial",
 * because its data is incomplete: it must never be shown as a full success.
 */
export function decideRunStatus(r: {
  sources: { status: "ok" | "partial" | "failed" }[];
  classifyErrors: number;
  baselineErrors: number;
  radarError: string | null;
  briefError: string | null;
  emailError: string | null;
}): "success" | "partial" {
  const everythingOk =
    r.sources.every((s) => s.status === "ok") &&
    r.classifyErrors === 0 &&
    r.baselineErrors === 0 &&
    !r.radarError &&
    !r.briefError &&
    !r.emailError;
  return everythingOk ? "success" : "partial";
}

/**
 * One database row per post. Source fields (what the source said) and AI
 * fields (our interpretation) are kept in separate columns; provenance
 * (run, retrieval time, matched keyword) is always attached.
 */
export function toPostRow(runId: string, p: ClassifiedPost) {
  return {
    // provenance
    run_id: runId,
    retrieved_at: p.retrievedAt,
    matched_keyword: p.matchedKeyword,
    // original source data
    source: p.source,
    external_id: p.externalId,
    url: p.url,
    title: p.title,
    snippet: p.snippet,
    author: p.author,
    score: p.score,
    comment_count: p.commentCount,
    posted_at: p.postedAt,
    // AI interpretation
    topic_id: p.classification.topicId,
    pain_point: p.classification.painPoint,
    is_unresolved: p.classification.isUnresolved,
    unresolved_reason: p.classification.unresolvedReason,
    sentiment: p.classification.sentiment,
    severity: p.classification.severity,
    competitors: p.classification.competitors,
  };
}

/**
 * The weekly run whose window ended 6-8 days before ours, if any. It is only
 * "comparable" when every source worked in both runs (same coverage).
 */
async function findPreviousWeeklyRun(runId: string, windowEnd: string, ourSourcesOk: boolean): Promise<PreviousRun | null> {
  const supabase = createServerClient();
  const end = new Date(windowEnd).getTime();
  const { data: prev } = await supabase
    .from("runs")
    .select("id, window_end, sources_status")
    .in("status", ["success", "partial"])
    .neq("id", runId)
    .gte("window_end", new Date(end - 8 * 86_400_000).toISOString())
    .lte("window_end", new Date(end - 6 * 86_400_000).toISOString())
    .order("window_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!prev) return null;

  const { data: stats } = await supabase.from("topic_stats").select("topic_id, mention_count").eq("run_id", prev.id);
  const theirSourcesOk = Object.values((prev.sources_status ?? {}) as Record<string, { ok: boolean }>).every((s) => s.ok);
  const comparable = ourSourcesOk && theirSourcesOk;
  return {
    runId: prev.id,
    windowEnd: prev.window_end,
    mentionsByTopic: Object.fromEntries((stats ?? []).map((s) => [s.topic_id, s.mention_count])),
    comparable,
    reason: comparable ? null : "a source was incomplete in one of the two runs",
  };
}

export async function runPipeline(trigger: "cron" | "manual"): Promise<PipelineSummary> {
  const supabase = createServerClient();
  await guardAgainstParallelRuns();

  // 1. Create the run row first, so even a crash is recorded.
  const { data: run, error: runError } = await supabase
    .from("runs")
    .insert({ status: "running", trigger })
    .select("id")
    .single();
  if (runError || !run) throw new Error(`Could not create run: ${runError?.message}`);

  const runId: string = run.id;
  const t0 = Date.now();

  try {
    // 2. Topics (editable in Supabase, no code changes).
    const topics = await getActiveTopics();
    if (topics.length === 0) throw new Error("No active topics. Add one on the /topics page.");

    // 3. Collect live posts.
    const collected = await collectAll(topics);
    const tCollect = Date.now() - t0;

    // 4. Classify (Gemini) and count the baseline (Hacker News) at the same time.
    const [classified, baseline] = await Promise.all([
      classifyPosts(collected.posts, topics),
      countBaseline(topics, new Date(collected.windowStart), new Date(collected.windowEnd)),
    ]);

    // 5. Save the relevant posts (irrelevant ones were dropped by Gemini).
    if (classified.classified.length) {
      const rows = classified.classified.map((p) => toPostRow(runId, p));
      const { error } = await supabase.from("posts").upsert(rows, { onConflict: "run_id,url", ignoreDuplicates: true });
      if (error) throw new Error(`Could not save posts: ${error.message}`);
    }

    // 6. Numbers per topic, then save them. A previous weekly run (6-8 days
    //    earlier, same sources working) allows a like-for-like comparison.
    const allSourcesOk = Object.values(collected.sources).every((s) => s.status === "ok");
    const previous = await findPreviousWeeklyRun(runId, collected.windowEnd, allSourcesOk);
    const topicStats = computeTopicStats(topics, classified.classified, baseline.topics, previous);
    const { error: statsError } = await supabase.from("topic_stats").insert(
      topicStats.map((s) => ({
        run_id: runId,
        topic_id: s.topicId,
        mention_count: s.mentionCount,
        unresolved_count: s.unresolvedCount,
        avg_severity: s.avgSeverity,
        avg_sentiment: s.avgSentiment,
        baseline_this_week: s.baselineThisWeek,
        baseline_last_week: s.baselineLastWeek,
        change_pct: s.changePct,
        trend: s.trend,
        trend_detail: s.trendDetail,
        score_frequency: s.scoreFrequency,
        score_growth: s.scoreGrowth,
        score_unresolved: s.scoreUnresolved,
        score_severity: s.scoreSeverity,
        score_raw: s.scoreRaw,
        opportunity_score: s.opportunityScore,
      })),
    );
    if (statsError) throw new Error(`Could not save topic stats: ${statsError.message}`);

    // Save the run's window, sources and numbers now: the brief reads them.
    const stats: Record<string, unknown> = {
      model: getModel(),
      postsCollected: collected.posts.length,
      rejected: collected.rejected, // invalid links / duplicates / over the 300 cap
      previousRunId: previous?.runId ?? null,
      previousRunComparable: previous?.comparable ?? false,
      postsKept: classified.classified.length,
      postsDropped: classified.dropped.length,
      geminiBatches: classified.batches,
      classifyErrors: classified.errors,
      baselineErrors: baseline.errors,
      baselineMs: baseline.durationMs,
      collectMs: tCollect,
    };
    await supabase
      .from("runs")
      .update({
        window_start: collected.windowStart,
        window_end: collected.windowEnd,
        sources_status: collected.sources,
        stats,
      })
      .eq("id", runId);

    // 7. Emerging Topic Radar (before the brief, so the brief can mention it).
    const tRadar = Date.now();
    const unmatched = classified.classified.filter((p) => p.classification.topicId === null);
    const radar = await runEmergingTopicRadar(runId, unmatched, topics);
    stats.radar = { unmatchedPosts: unmatched.length, ...radar, ms: Date.now() - tRadar };

    // 8. The Friday brief: write (Gemini) -> save -> email (Resend).
    const tBrief = Date.now();
    try {
      const brief = await createBrief(runId);
      stats.briefId = brief.id;
      stats.briefChecks = brief.checks;
      const email = await sendBriefEmail(brief.id);
      stats.emailSent = email.ok;
      if (!email.ok) stats.emailError = email.error;
    } catch (err) {
      stats.briefError = err instanceof Error ? err.message : String(err);
    }
    stats.briefMs = Date.now() - tBrief;
    stats.totalMs = Date.now() - t0;

    // 9. Finish: "partial" if any source, Gemini batch, baseline, brief or email failed.
    const status = decideRunStatus({
      sources: Object.values(collected.sources),
      classifyErrors: classified.errors.length,
      baselineErrors: baseline.errors.length,
      radarError: radar.error,
      briefError: (stats.briefError as string) ?? null,
      emailError: (stats.emailError as string) ?? null,
    });

    await supabase.from("runs").update({ status, finished_at: new Date().toISOString(), stats }).eq("id", runId);

    return { runId, status, stats, topicStats };
  } catch (err) {
    // Anything unexpected: record it on the run so /runs can show what went wrong.
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("runs")
      .update({ status: "failed", finished_at: new Date().toISOString(), error: message, stats: { totalMs: Date.now() - t0 } })
      .eq("id", runId);
    return { runId, status: "failed", stats: {}, topicStats: [], error: message };
  }
}
