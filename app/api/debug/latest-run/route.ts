// GET /api/debug/latest-run
// Read-only test endpoint for Step 5: shows the most recent run, its
// per-source status, and every topic ranked by Opportunity Score with
// trend and top-3 evidence links.
//
// Protected like the other debug endpoints: open in local development;
// in production it needs  Authorization: Bearer <CRON_SECRET>.

import { hasCronSecret } from "@/lib/auth";
import { createServerClient } from "@/lib/db/supabase";
import { formatTrend, type Trend } from "@/lib/pipeline/scoring";

export async function GET(request: Request) {
  const isDev = process.env.NODE_ENV === "development";
  if (!isDev && !hasCronSecret(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data: run } = await supabase.from("runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (!run) return Response.json({ message: "No runs yet." });

  const [{ data: stats }, { data: posts }, { data: topics }] = await Promise.all([
    supabase.from("topic_stats").select("*").eq("run_id", run.id).order("opportunity_score", { ascending: false }),
    supabase
      .from("posts")
      .select("topic_id, title, url, source, pain_point, is_unresolved, severity, score, comment_count")
      .eq("run_id", run.id),
    supabase.from("topics").select("id, name"),
  ]);

  const nameById = new Map((topics ?? []).map((t) => [t.id, t.name]));
  const engagement = (p: { score: number | null; comment_count: number | null }) => (p.score ?? 0) + (p.comment_count ?? 0);

  return Response.json({
    run: {
      id: run.id,
      status: run.status,
      trigger: run.trigger,
      startedAt: run.started_at,
      finishedAt: run.finished_at,
      window: { start: run.window_start, end: run.window_end },
      error: run.error,
      stats: run.stats,
      sources: run.sources_status,
    },
    topics: (stats ?? []).map((s) => ({
      topic: nameById.get(s.topic_id),
      opportunityScore: Number(s.opportunity_score),
      mentions: s.mention_count,
      trend: formatTrend(s.trend as Trend, s.change_pct === null ? null : Number(s.change_pct)),
      keywordMatches: { thisWeek: s.baseline_this_week, lastWeek: s.baseline_last_week, bySource: s.trend_detail },
      unresolvedPct: s.mention_count ? Math.round((s.unresolved_count / s.mention_count) * 100) : 0,
      avgSeverity: s.avg_severity === null ? null : Number(s.avg_severity),
      avgSentiment: s.avg_sentiment === null ? null : Number(s.avg_sentiment),
      whyThisScore: {
        frequency: Number(s.score_frequency),
        growth: Number(s.score_growth),
        unresolved: Number(s.score_unresolved),
        severity: Number(s.score_severity),
        raw: Number(s.score_raw),
      },
      evidence: (posts ?? [])
        .filter((p) => p.topic_id === s.topic_id)
        .sort((a, b) => engagement(b) - engagement(a))
        .slice(0, 3)
        .map((p) => ({ title: p.title, url: p.url, source: p.source, painPoint: p.pain_point })),
    })),
  });
}
