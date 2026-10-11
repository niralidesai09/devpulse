// Turns classified posts + baseline counts into one stats row per topic:
// mention count, trend vs last week, unresolved %, severity, sentiment,
// and the Opportunity Score (0-100) with all of its components.
//
// Pure functions only (no database, no network) so they are easy to test
// and easy to explain.
//
// OPPORTUNITY SCORE
//   frequency  = this topic's mentions / the top topic's mentions   (0..1)
//   growth     = (this week + 3) / (last week + 3), kept between 0.5 and 2 (1 = flat)
//                The "+3" (smoothing) stops tiny numbers from swinging the score:
//                2 vs 0 posts gives 1.67, not "infinitely more". No trend data gets 1.
//   unresolved = unresolved posts / mentions                         (0..1)
//   severity   = average severity / 5                                (0.2..1)
//   raw        = frequency x growth x unresolved x severity
//   score      = raw / highest raw this week x 100  -> the best opportunity = 100

import type { ClassifiedPost } from "@/lib/ai/classify";
import type { TopicInput } from "@/lib/sources/types";
import type { TopicBaseline } from "./baseline";

export type Trend = "up" | "down" | "flat" | "new" | "no_data";

export type TopicStat = {
  topicId: string;
  mentionCount: number; // posts Gemini kept for this topic this week
  unresolvedCount: number;
  avgSeverity: number | null;
  avgSentiment: number | null;
  baselineThisWeek: number | null; // keyword matches, days 0-7
  baselineLastWeek: number | null; // keyword matches, days 8-14
  changePct: number | null; // null when "new" or no data
  trend: Trend;
  trendDetail: TopicBaseline["bySource"];
  scoreFrequency: number;
  scoreGrowth: number;
  scoreUnresolved: number;
  scoreSeverity: number;
  scoreRaw: number;
  opportunityScore: number; // 0..100
};

const FLAT_THRESHOLD_PCT = 5; // within ±5% counts as "flat"
const SMOOTHING = 3; // added to both weeks in the growth factor

const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;
const average = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Week-over-week change from the baseline counts. */
export function computeTrend(baseline: TopicBaseline | undefined): Pick<TopicStat, "changePct" | "trend"> {
  if (!baseline || Object.keys(baseline.bySource).length === 0) return { changePct: null, trend: "no_data" };
  const { thisWeek, lastWeek } = baseline;
  if (lastWeek === 0) return thisWeek > 0 ? { changePct: null, trend: "new" } : { changePct: 0, trend: "flat" };

  const changePct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
  const trend: Trend = changePct > FLAT_THRESHOLD_PCT ? "up" : changePct < -FLAT_THRESHOLD_PCT ? "down" : "flat";
  return { changePct, trend };
}

/** Growth factor for the Opportunity Score (0.5 .. 2, 1 = flat). */
export function growthFactor(baseline: TopicBaseline | undefined, trend: Trend): number {
  if (!baseline || trend === "no_data") return 1; // no data: don't reward or punish
  const ratio = (baseline.thisWeek + SMOOTHING) / (baseline.lastWeek + SMOOTHING);
  return Math.min(Math.max(ratio, 0.5), 2);
}

export function computeTopicStats(
  topics: TopicInput[],
  posts: ClassifiedPost[],
  baseline: Record<string, TopicBaseline>,
): TopicStat[] {
  // First pass: the plain numbers per topic.
  const rows = topics.map((topic) => {
    const mine = posts.filter((p) => p.classification.topicId === topic.id);
    const unresolvedCount = mine.filter((p) => p.classification.isUnresolved).length;
    const avgSeverity = average(mine.map((p) => p.classification.severity));
    const avgSentiment = average(mine.map((p) => p.classification.sentiment));
    const base = baseline[topic.id];
    const { changePct, trend } = computeTrend(base);
    const hasBaseline = trend !== "no_data";

    return {
      topicId: topic.id,
      mentionCount: mine.length,
      unresolvedCount,
      avgSeverity: avgSeverity === null ? null : round(avgSeverity),
      avgSentiment: avgSentiment === null ? null : round(avgSentiment),
      baselineThisWeek: hasBaseline ? base.thisWeek : null,
      baselineLastWeek: hasBaseline ? base.lastWeek : null,
      changePct,
      trend,
      trendDetail: base?.bySource ?? {},
      scoreGrowth: growthFactor(base, trend),
    };
  });

  // Second pass: Opportunity Score components (need the max across topics).
  const maxMentions = Math.max(0, ...rows.map((r) => r.mentionCount));
  const scored = rows.map((r) => {
    const scoreFrequency = maxMentions ? r.mentionCount / maxMentions : 0;
    const scoreUnresolved = r.mentionCount ? r.unresolvedCount / r.mentionCount : 0;
    const scoreSeverity = r.avgSeverity ? r.avgSeverity / 5 : 0;
    const scoreRaw = scoreFrequency * r.scoreGrowth * scoreUnresolved * scoreSeverity;
    return { ...r, scoreFrequency, scoreUnresolved, scoreSeverity, scoreRaw };
  });

  const maxRaw = Math.max(0, ...scored.map((r) => r.scoreRaw));
  return scored.map((r) => ({
    ...r,
    scoreFrequency: round(r.scoreFrequency, 3),
    scoreGrowth: round(r.scoreGrowth, 3),
    scoreUnresolved: round(r.scoreUnresolved, 3),
    scoreSeverity: round(r.scoreSeverity, 3),
    scoreRaw: round(r.scoreRaw, 4),
    opportunityScore: maxRaw ? Math.round((r.scoreRaw / maxRaw) * 100) : 0,
  }));
}

/** "▲ 25%", "▼ 10%", "new", "flat", "–" — used by the brief, email and UI. */
export function formatTrend(trend: Trend, changePct: number | null): string {
  if (trend === "new") return "new";
  if (trend === "no_data" || changePct === null) return "–";
  if (trend === "flat") return `→ ${changePct > 0 ? "+" : ""}${changePct}%`;
  return `${changePct > 0 ? "▲" : "▼"} ${Math.abs(changePct)}%`;
}
