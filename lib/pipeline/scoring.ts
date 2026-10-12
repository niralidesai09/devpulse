// Turns classified posts + comparison counts into one stats row per topic.
// Pure functions only (no database, no network) so they are easy to test
// and easy to explain.
//
// TWO DIFFERENT MEASUREMENTS (never mixed up):
//   1. Mentions          = relevant posts this week across ALL FOUR sources
//                          (Hacker News, GitHub Issues, Stack Overflow, DEV.to),
//                          deduplicated, after AI relevance filtering.
//   2. HN keyword trend  = Hacker News exact-phrase keyword matches,
//                          this week (days 0-7) vs last week (days 8-14).
//                          Hacker News ONLY: the only source that can count
//                          both weeks the same way on the first run.
//   When a previous weekly run exists with the same sources working, mentions
//   are also compared run-over-run (all four sources, like for like).
//
// SMALL SAMPLES: if this week + last week < MIN_SAMPLE, the trend is
// "low_data" ("too few to compare"): no %, no direction, no growth boost.
// "new" = 0 last week and ≥ MIN_SAMPLE this week: newly observed in the
// collected Hacker News data, not proof the problem is new to the world.
//
// OPPORTUNITY SCORE (a RELATIVE ranking of this week's topics, 0-100;
// not an absolute measure of market opportunity)
//   frequency  = mentions / the top topic's mentions                 (0..1)
//   growth     = (this + 3) / (previous + 3), kept between 0.5 and 2 (1 = no change)
//                basis: previous weekly run if comparable, else HN keyword trend,
//                else 1 (neutral) when there is too little data.
//   unresolved = unresolved posts / mentions                         (0..1)
//   severity   = average severity / 5                                (0.2..1)
//   raw        = frequency × growth × unresolved × severity
//   score      = raw / highest raw this week × 100  -> this week's top topic = 100

import type { ClassifiedPost } from "@/lib/ai/classify";
import type { TopicInput } from "@/lib/sources/types";
import type { TopicBaseline } from "./baseline";

export type Trend = "up" | "down" | "flat" | "new" | "low_data" | "no_data";
export type GrowthBasis = "previous_run" | "hn_keywords" | "none";

/** A previous weekly run to compare mentions with (same 4 sources). */
export type PreviousRun = {
  runId: string;
  windowEnd: string;
  mentionsByTopic: Record<string, number>; // topic id -> mentions in that run
  comparable: boolean; // false if its sources (or ours) were not all OK
  reason: string | null; // why it is not comparable
};

export type TrendDetail = {
  hackernews?: { thisWeek: number; lastWeek: number };
  previousRun?: { runId: string; windowEnd: string; mentions: number | null; comparable: boolean; reason: string | null };
  growthBasis: GrowthBasis;
};

export type TopicStat = {
  topicId: string;
  mentionCount: number; // relevant posts this week, all four sources
  unresolvedCount: number;
  avgSeverity: number | null;
  avgSentiment: number | null;
  baselineThisWeek: number | null; // HN keyword matches, days 0-7
  baselineLastWeek: number | null; // HN keyword matches, days 8-14
  changePct: number | null; // HN keyword change; null unless a direction can be stated
  trend: Trend; // HN keyword trend
  trendDetail: TrendDetail;
  scoreFrequency: number;
  scoreGrowth: number;
  scoreUnresolved: number;
  scoreSeverity: number;
  scoreRaw: number;
  opportunityScore: number; // 0..100, relative
};

export const MIN_SAMPLE = 5; // this + last week below this -> "too few to compare"
const FLAT_THRESHOLD_PCT = 5; // within ±5% counts as "flat"
export const SMOOTHING = 3; // added to both weeks in the growth factor

const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;
const average = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const clampGrowth = (x: number) => Math.min(Math.max(x, 0.5), 2);

/** Direction + % change from two counts (no NaN, no Infinity). */
export function compareCounts(thisWeek: number, lastWeek: number): { trend: Trend; changePct: number | null } {
  if (thisWeek + lastWeek < MIN_SAMPLE) return { trend: "low_data", changePct: null };
  if (lastWeek === 0) return { trend: "new", changePct: null };
  const changePct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
  const trend: Trend = changePct > FLAT_THRESHOLD_PCT ? "up" : changePct < -FLAT_THRESHOLD_PCT ? "down" : "flat";
  return { trend, changePct };
}

/** HN keyword trend from the smart-baseline counts. */
export function computeTrend(baseline: TopicBaseline | undefined): { trend: Trend; changePct: number | null } {
  if (!baseline || Object.keys(baseline.bySource).length === 0) return { trend: "no_data", changePct: null };
  return compareCounts(baseline.thisWeek, baseline.lastWeek);
}

/** Smoothed growth factor (0.5 .. 2); neutral 1 when there is too little data. */
export function growthFromCounts(thisWeek: number, lastWeek: number): number {
  if (thisWeek + lastWeek < MIN_SAMPLE) return 1;
  return clampGrowth((thisWeek + SMOOTHING) / (lastWeek + SMOOTHING));
}

export function computeTopicStats(
  topics: TopicInput[],
  posts: ClassifiedPost[],
  baseline: Record<string, TopicBaseline>,
  previous: PreviousRun | null = null,
): TopicStat[] {
  // First pass: the plain numbers per topic.
  const rows = topics.map((topic) => {
    const mine = posts.filter((p) => p.classification.topicId === topic.id);
    const mentionCount = mine.length;
    const unresolvedCount = mine.filter((p) => p.classification.isUnresolved).length;
    const avgSeverity = average(mine.map((p) => p.classification.severity));
    const avgSentiment = average(mine.map((p) => p.classification.sentiment));
    const base = baseline[topic.id];
    const { changePct, trend } = computeTrend(base);
    const hasBaseline = trend !== "no_data";

    // Growth basis: previous comparable weekly run (all sources) > HN keywords > none.
    const prevMentions = previous?.comparable ? (previous.mentionsByTopic[topic.id] ?? null) : null;
    let growth = 1;
    let growthBasis: GrowthBasis = "none";
    if (prevMentions !== null && mentionCount + prevMentions >= MIN_SAMPLE) {
      growth = growthFromCounts(mentionCount, prevMentions);
      growthBasis = "previous_run";
    } else if (hasBaseline && trend !== "low_data") {
      growth = growthFromCounts(base.thisWeek, base.lastWeek);
      growthBasis = "hn_keywords";
    }

    const trendDetail: TrendDetail = { growthBasis };
    if (hasBaseline) trendDetail.hackernews = { thisWeek: base.thisWeek, lastWeek: base.lastWeek };
    if (previous) {
      trendDetail.previousRun = {
        runId: previous.runId,
        windowEnd: previous.windowEnd,
        mentions: previous.mentionsByTopic[topic.id] ?? null,
        comparable: previous.comparable,
        reason: previous.reason,
      };
    }

    return {
      topicId: topic.id,
      mentionCount,
      unresolvedCount,
      avgSeverity: avgSeverity === null ? null : round(avgSeverity),
      avgSentiment: avgSentiment === null ? null : round(avgSentiment),
      baselineThisWeek: hasBaseline ? base.thisWeek : null,
      baselineLastWeek: hasBaseline ? base.lastWeek : null,
      changePct,
      trend,
      trendDetail,
      scoreGrowth: growth,
    };
  });

  // Second pass: Opportunity Score components (need the max across topics).
  // Each component is rounded to 4 decimals FIRST and the product is made
  // from those exact numbers, so the "Why this score?" maths shown in the
  // UI always multiplies out to the stored result.
  const maxMentions = Math.max(0, ...rows.map((r) => r.mentionCount));
  const scored = rows.map((r) => {
    const scoreFrequency = round(maxMentions ? r.mentionCount / maxMentions : 0, 4);
    const scoreGrowth = round(r.scoreGrowth, 4);
    const scoreUnresolved = round(r.mentionCount ? r.unresolvedCount / r.mentionCount : 0, 4);
    const scoreSeverity = round(r.avgSeverity ? r.avgSeverity / 5 : 0, 4);
    const scoreRaw = round(scoreFrequency * scoreGrowth * scoreUnresolved * scoreSeverity, 4);
    return { ...r, scoreFrequency, scoreGrowth, scoreUnresolved, scoreSeverity, scoreRaw };
  });

  const maxRaw = Math.max(0, ...scored.map((r) => r.scoreRaw));
  return scored.map((r) => ({
    ...r,
    opportunityScore: maxRaw ? Math.round((r.scoreRaw / maxRaw) * 100) : 0,
  }));
}

/**
 * HN keyword trend as text, always with the counts so it can't be mistaken
 * for the all-source mention count, e.g. "11 → 19 (▲ 73%)", "0 → 6 (new)",
 * "2 → 0 (too few to compare)".
 */
export function formatTrend(trend: Trend, changePct: number | null, thisWeek?: number | null, lastWeek?: number | null): string {
  const counts = thisWeek !== null && thisWeek !== undefined && lastWeek !== null && lastWeek !== undefined ? `${lastWeek} → ${thisWeek} ` : "";
  switch (trend) {
    case "no_data":
      return "no data";
    case "low_data":
      return `${counts}(too few to compare)`.trim();
    case "new":
      return `${counts}(new in HN data)`.trim();
    case "flat":
      return `${counts}(→ ${changePct !== null && changePct > 0 ? "+" : ""}${changePct ?? 0}%)`.trim();
    default:
      return `${counts}(${(changePct ?? 0) > 0 ? "▲" : "▼"} ${Math.abs(changePct ?? 0)}%)`.trim();
  }
}

/** Mentions vs the previous weekly run, as text (or why it can't be compared). */
export function formatRunComparison(mentions: number, detail: TrendDetail | null | undefined): string {
  const prev = detail?.previousRun;
  if (!prev) return "no previous weekly run yet";
  if (!prev.comparable) return `not comparable (${prev.reason ?? "different sources"})`;
  if (prev.mentions === null) return "topic not monitored last run";
  const { trend, changePct } = compareCounts(mentions, prev.mentions);
  return formatTrend(trend, changePct, mentions, prev.mentions).replace("new in HN data", "new");
}
