// Read-only queries for the dashboard pages ("/" and "/runs").
// Server only (uses the service-role client).

import { formatTrend, type Trend } from "@/lib/pipeline/scoring";
import { createServerClient } from "./supabase";

export type SourceStatus = { ok: boolean; count: number; error: string | null; durationMs: number };

export type RunRow = {
  id: string;
  status: "running" | "success" | "partial" | "failed";
  trigger: "cron" | "manual";
  startedAt: string;
  finishedAt: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  sources: Record<string, SourceStatus>;
  stats: Record<string, unknown>;
  error: string | null;
};

export type EvidenceLink = {
  title: string;
  url: string;
  source: string;
  painPoint: string | null;
  isUnresolved: boolean;
  unresolvedReason: string | null;
  severity: number | null;
};

export type TopicCard = {
  topicId: string;
  name: string;
  opportunityScore: number;
  mentions: number;
  unresolvedCount: number;
  unresolvedPct: number;
  avgSeverity: number | null;
  avgSentiment: number | null;
  trend: Trend;
  changePct: number | null;
  trendLabel: string; // "▲ 25%", "new", ...
  keywordsThisWeek: number | null;
  keywordsLastWeek: number | null;
  components: { frequency: number; growth: number; unresolved: number; severity: number; raw: number };
  evidence: EvidenceLink[]; // top 3 threads that best justify the score
};

export type Dashboard = {
  run: RunRow;
  topics: TopicCard[]; // ranked by Opportunity Score
  brief: { markdown: string; emailedAt: string | null; emailError: string | null; model: string | null } | null;
  totals: { collected: number; kept: number; unresolved: number };
};

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function toRunRow(r: Record<string, unknown>): RunRow {
  return {
    id: r.id as string,
    status: r.status as RunRow["status"],
    trigger: (r.trigger as RunRow["trigger"]) ?? "cron",
    startedAt: r.started_at as string,
    finishedAt: (r.finished_at as string) ?? null,
    windowStart: (r.window_start as string) ?? null,
    windowEnd: (r.window_end as string) ?? null,
    sources: (r.sources_status as Record<string, SourceStatus>) ?? {},
    stats: (r.stats as Record<string, unknown>) ?? {},
    error: (r.error as string) ?? null,
  };
}

/** The most recent run that produced data, with everything the home page shows. */
export async function getDashboard(): Promise<Dashboard | null> {
  const supabase = createServerClient();
  const { data: run } = await supabase
    .from("runs")
    .select("*")
    .in("status", ["success", "partial"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) return null;

  const [{ data: stats }, { data: posts }, { data: topics }, { data: brief }] = await Promise.all([
    supabase.from("topic_stats").select("*").eq("run_id", run.id).order("opportunity_score", { ascending: false }),
    supabase
      .from("posts")
      .select("topic_id, title, url, source, pain_point, is_unresolved, unresolved_reason, severity, score, comment_count")
      .eq("run_id", run.id),
    supabase.from("topics").select("id, name"),
    supabase.from("briefs").select("markdown, emailed_at, email_error, model").eq("run_id", run.id).maybeSingle(),
  ]);

  const nameById = new Map((topics ?? []).map((t) => [t.id as string, t.name as string]));
  const engagement = (p: { score: number | null; comment_count: number | null }) => (p.score ?? 0) + (p.comment_count ?? 0);
  const allPosts = posts ?? [];

  // Evidence = the threads that best justify an "opportunity":
  // unresolved first, then most severe, then most discussed.
  type PostRow = (typeof allPosts)[number];
  const byJustification = (a: PostRow, b: PostRow) =>
    Number(b.is_unresolved) - Number(a.is_unresolved) ||
    (b.severity ?? 0) - (a.severity ?? 0) ||
    engagement(b) - engagement(a);

  const cards: TopicCard[] = (stats ?? []).map((s) => {
    const trend = s.trend as Trend;
    const changePct = num(s.change_pct);
    return {
      topicId: s.topic_id,
      name: nameById.get(s.topic_id) ?? "Deleted topic",
      opportunityScore: Number(s.opportunity_score ?? 0),
      mentions: s.mention_count,
      unresolvedCount: s.unresolved_count,
      unresolvedPct: s.mention_count ? Math.round((s.unresolved_count / s.mention_count) * 100) : 0,
      avgSeverity: num(s.avg_severity),
      avgSentiment: num(s.avg_sentiment),
      trend,
      changePct,
      trendLabel: formatTrend(trend, changePct),
      keywordsThisWeek: s.baseline_this_week,
      keywordsLastWeek: s.baseline_last_week,
      components: {
        frequency: Number(s.score_frequency ?? 0),
        growth: Number(s.score_growth ?? 1),
        unresolved: Number(s.score_unresolved ?? 0),
        severity: Number(s.score_severity ?? 0),
        raw: Number(s.score_raw ?? 0),
      },
      evidence: allPosts
        .filter((p) => p.topic_id === s.topic_id)
        .sort(byJustification)
        .slice(0, 3)
        .map((p) => ({
          title: p.title,
          url: p.url,
          source: p.source,
          painPoint: p.pain_point,
          isUnresolved: Boolean(p.is_unresolved),
          unresolvedReason: p.unresolved_reason,
          severity: p.severity,
        })),
    };
  });

  const runRow = toRunRow(run);
  return {
    run: runRow,
    topics: cards,
    brief: brief
      ? { markdown: brief.markdown, emailedAt: brief.emailed_at, emailError: brief.email_error, model: brief.model }
      : null,
    totals: {
      collected: Number(runRow.stats.postsCollected ?? 0),
      kept: allPosts.length,
      unresolved: allPosts.filter((p) => p.is_unresolved).length,
    },
  };
}

/** Run history, newest first. */
export async function getRuns(limit = 30): Promise<RunRow[]> {
  const { data, error } = await createServerClient()
    .from("runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load runs: ${error.message}`);
  return (data ?? []).map(toRunRow);
}

export type Suggestion = {
  id: string;
  name: string;
  description: string | null;
  rationale: string | null;
  keywords: string[];
  evidence: { url: string; title: string; source: string }[];
  postCount: number;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  decidedAt: string | null;
};

/** Emerging Topic Radar: pending suggestions first, plus the 5 latest decisions. */
export async function getSuggestions(): Promise<{ pending: Suggestion[]; decided: Suggestion[] }> {
  const supabase = createServerClient();
  const [{ data: pending }, { data: decided }] = await Promise.all([
    supabase.from("suggested_topics").select("*").eq("status", "pending").order("post_count", { ascending: false }).limit(10),
    supabase.from("suggested_topics").select("*").neq("status", "pending").order("decided_at", { ascending: false }).limit(5),
  ]);

  // Look up titles for the evidence links (newest copy of each URL).
  const urls = [...new Set([...(pending ?? []), ...(decided ?? [])].flatMap((s) => (s.evidence_urls ?? []) as string[]))];
  const { data: posts } = urls.length
    ? await supabase.from("posts").select("url, title, source, created_at").in("url", urls).order("created_at", { ascending: false })
    : { data: [] };
  const byUrl = new Map<string, { title: string; source: string }>();
  for (const p of posts ?? []) if (!byUrl.has(p.url)) byUrl.set(p.url, { title: p.title, source: p.source });

  const toSuggestion = (s: Record<string, unknown>): Suggestion => ({
    id: s.id as string,
    name: s.name as string,
    description: (s.description as string) ?? null,
    rationale: (s.rationale as string) ?? null,
    keywords: (s.keywords as string[]) ?? [],
    evidence: ((s.evidence_urls as string[]) ?? []).map((url) => ({ url, title: byUrl.get(url)?.title ?? url, source: byUrl.get(url)?.source ?? "" })),
    postCount: Number(s.post_count ?? 0),
    status: s.status as Suggestion["status"],
    createdAt: s.created_at as string,
    decidedAt: (s.decided_at as string) ?? null,
  });
  return { pending: (pending ?? []).map(toSuggestion), decided: (decided ?? []).map(toSuggestion) };
}
