// runPipeline(): ONE complete weekly run.
//
//   1. Create a "runs" row (status = running)
//   2. Load active topics from Supabase
//   3. Collect live posts from all 4 sources (last 7 days)
//   4. In parallel:  a) Gemini classifies the posts
//                    b) Smart baseline counts HN keyword matches for this week + last week
//   5. Save the relevant posts
//   6. Compute topic_stats (mentions, trend, unresolved %, Opportunity Score) and save
//   7. Gemini writes the Friday brief -> save it -> email it with Resend
//   8. Mark the run success / partial / failed, with per-source status
//
// A failed brief or email does NOT lose the data: the run becomes "partial"
// and the brief can be re-written / re-sent later.

import { classifyPosts } from "@/lib/ai/classify";
import { getModel } from "@/lib/ai/gemini";
import { createServerClient } from "@/lib/db/supabase";
import { getActiveTopics } from "@/lib/db/topics";
import { sendBriefEmail } from "@/lib/email/brief-email";
import { collectAll } from "@/lib/sources";
import { countBaseline } from "./baseline";
import { createBrief } from "./brief";
import { computeTopicStats, type TopicStat } from "./scoring";

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
      const rows = classified.classified.map((p) => ({
        run_id: runId,
        source: p.source,
        external_id: p.externalId,
        url: p.url,
        title: p.title,
        snippet: p.snippet,
        author: p.author,
        score: p.score,
        comment_count: p.commentCount,
        posted_at: p.postedAt,
        matched_keyword: p.matchedKeyword,
        topic_id: p.classification.topicId,
        pain_point: p.classification.painPoint,
        is_unresolved: p.classification.isUnresolved,
        unresolved_reason: p.classification.unresolvedReason,
        sentiment: p.classification.sentiment,
        severity: p.classification.severity,
        competitors: p.classification.competitors,
      }));
      const { error } = await supabase.from("posts").upsert(rows, { onConflict: "run_id,url", ignoreDuplicates: true });
      if (error) throw new Error(`Could not save posts: ${error.message}`);
    }

    // 6. Numbers per topic, then save them.
    const topicStats = computeTopicStats(topics, classified.classified, baseline.topics);
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

    // 7. The Friday brief: write (Gemini) -> save -> email (Resend).
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

    // 8. Finish: "partial" if any source, Gemini batch, baseline, brief or email failed.
    const sourceFailed = Object.values(collected.sources).some((s) => !s.ok);
    const somethingFailed =
      sourceFailed || classified.errors.length || baseline.errors.length || stats.briefError || stats.emailError;
    const status = somethingFailed ? "partial" : "success";

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
