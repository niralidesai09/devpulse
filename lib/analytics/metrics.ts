// Deterministic analytics. EVERY number shown in the app or given to the
// model comes from here — the model interprets evidence, it never counts.
//
// Pure functions only (no I/O) → covered by tests/unit/metrics.test.ts.

import { MIN_TREND_SAMPLE } from "@/lib/config";
import type { MetricRow } from "@/lib/db/discussions";
import type { SourceRunRow } from "@/lib/db/types";
import { inPeriod, type Period } from "@/lib/time/periods";

export type TrendStatus = "new" | "growing" | "stable" | "declining" | "gone" | "insufficient_data";

export type PeriodRef = { start: string; end: string; label: string };

export type SignalComponents = {
  volume: number; // log-scaled current count relative to the busiest pain point
  recurrence: number; // share of the last N complete weeks it appeared in
  diversity: number; // distinct sources (current + previous), capped at 3
  unresolved: number; // share of current discussions judged unresolved
  growth: number; // damped change vs previous week, mapped to 0..1 (0.5 = flat)
  dissatisfaction: number; // share of current discussions criticising existing tools
};

export const SIGNAL_WEIGHTS: SignalComponents = {
  volume: 0.3,
  recurrence: 0.2,
  diversity: 0.15,
  unresolved: 0.15,
  growth: 0.1,
  dissatisfaction: 0.1,
};

export type PainPointMetric = {
  painPointId: string;
  title: string;
  topicId: string | null;
  topicName: string | null;
  current: number;
  previous: number;
  absChange: number;
  pctChange: number | null;
  status: TrendStatus;
  unresolvedCurrent: number;
  dissatisfiedCurrent: number;
  sourcesCurrent: string[];
  sourcesAll: string[];
  periodsPresent: number;
  weekly: number[]; // counts per complete week in the series (oldest first)
  firstSeen: string | null;
  lastSeen: string | null;
  signalScore: number; // 0..100
  signal: SignalComponents;
  rank: number;
};

export type TopicMetric = {
  topicId: string;
  name: string;
  current: number;
  previous: number;
  absChange: number;
  pctChange: number | null;
  status: TrendStatus;
  painPointCount: number;
};

export type ReportMetrics = {
  version: 1;
  generatedAt: string;
  timezone: string;
  current: PeriodRef;
  previous: PeriodRef;
  totals: {
    current: PeriodTotals;
    previous: PeriodTotals;
  };
  comparableSources: string[];
  excludedFromComparison: { sourceId: string; reason: string }[];
  retrospective: { previousShare: number; note: string | null };
  series: {
    label: string;
    start: string;
    end: string;
    complete: boolean;
    unique: number;
    relevant: number;
    bySource: Record<string, number>;
  }[];
  topics: TopicMetric[];
  sources: { sourceId: string; current: number; previous: number; relevantCurrent: number }[];
  painPoints: PainPointMetric[];
  groups: {
    new: string[];
    recurring: string[];
    growing: string[];
    declining: string[];
    gone: string[];
  };
  unclassified: { relevantWithoutPainPoint: number; pendingAnalysis: number; failedAnalysis: number };
  quality: { sufficientForTrend: boolean; warnings: string[] };
};

export type PeriodTotals = {
  unique: number; // distinct discussions published in the period (all sources, excl. excluded)
  relevant: number; // judged relevant by the model
  irrelevant: number;
  pending: number; // not yet analysed (or failed)
  excluded: number; // removed by the PM
  painPoints: number; // distinct pain points with ≥1 relevant discussion
};

// ---------------------------------------------------------------------
// Small, separately tested building blocks
// ---------------------------------------------------------------------

/** % change, or null when the previous value is 0 (a percentage would be meaningless). */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Trend label with a minimum-sample rule, so a move from 1 → 2 is never
 * called "growing 100%".
 */
export function trendStatus(current: number, previous: number, minSample = MIN_TREND_SAMPLE): TrendStatus {
  if (current > 0 && previous === 0) return "new";
  if (current === 0 && previous > 0) return "gone";
  if (current + previous < minSample) return "insufficient_data";
  const abs = current - previous;
  const pct = pctChange(current, previous)!;
  if (abs >= 2 && pct >= 25) return "growing";
  if (abs <= -2 && pct <= -25) return "declining";
  return "stable";
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

export function signalScore(input: {
  current: number;
  previous: number;
  maxCurrent: number;
  periodsPresent: number;
  seriesLength: number;
  distinctSources: number;
  unresolvedCurrent: number;
  dissatisfiedCurrent: number;
}): { score: number; components: SignalComponents } {
  const c = input.current;
  const components: SignalComponents = {
    volume: input.maxCurrent > 0 ? clamp01(Math.log1p(c) / Math.log1p(input.maxCurrent)) : 0,
    recurrence: input.seriesLength > 0 ? clamp01(input.periodsPresent / input.seriesLength) : 0,
    diversity: clamp01(input.distinctSources / 3),
    unresolved: c > 0 ? clamp01(input.unresolvedCurrent / c) : 0,
    // Denominator of at least 2 damps tiny-sample swings (1 → 3 is +0.5, not +200%).
    growth: clamp01(((c - input.previous) / Math.max(input.previous, 2) + 1) / 2),
    dissatisfaction: c > 0 ? clamp01(input.dissatisfiedCurrent / c) : 0,
  };
  let score = 0;
  for (const k of Object.keys(SIGNAL_WEIGHTS) as (keyof SignalComponents)[]) score += SIGNAL_WEIGHTS[k] * components[k];
  for (const k of Object.keys(components) as (keyof SignalComponents)[]) components[k] = round(components[k]);
  return { score: Math.round(score * 100), components };
}

/** Sources with a usable collection whose window fully covered the period. */
export function coveredSources(period: Pick<Period, "start" | "end">, sourceRuns: SourceRunRow[]): Set<string> {
  const out = new Set<string>();
  for (const r of sourceRuns) {
    if (r.status !== "succeeded" && r.status !== "partial") continue;
    if (!r.window_start || !r.window_end) continue;
    if (new Date(r.window_start) <= period.start && new Date(r.window_end) >= period.end) out.add(r.source_id);
  }
  return out;
}

// ---------------------------------------------------------------------
// The full computation
// ---------------------------------------------------------------------

export function computeReportMetrics(input: {
  rows: MetricRow[];
  series: Period[]; // complete weeks, oldest first; last = current reporting period
  partial: Period | null; // the in-progress week (volume chart only)
  painPoints: Map<string, { title: string; topicId: string | null }>;
  topics: Map<string, { name: string }>;
  sourceRuns: SourceRunRow[];
  enabledSources: string[];
  timezone: string;
  now: Date;
}): ReportMetrics {
  const { rows, series, partial } = input;
  const current = series[series.length - 1];
  const previous = series[series.length - 2];
  const warnings: string[] = [];

  // ----- Like-for-like source comparison -----
  const covCurrent = coveredSources(current, input.sourceRuns);
  const covPrevious = coveredSources(previous, input.sourceRuns);
  const comparable = input.enabledSources.filter((s) => covCurrent.has(s) && covPrevious.has(s));
  const excludedFromComparison = input.enabledSources
    .filter((s) => !comparable.includes(s))
    .map((s) => ({
      sourceId: s,
      reason: !covCurrent.has(s) && !covPrevious.has(s)
        ? "no successful collection covered either week"
        : !covCurrent.has(s)
          ? "no successful collection covered the current week"
          : "no successful collection covered the previous week",
    }));
  if (excludedFromComparison.length) {
    warnings.push(
      `Week-on-week changes use only ${comparable.length ? comparable.join(", ") : "no sources"}; ` +
        excludedFromComparison.map((e) => `${e.sourceId} (${e.reason})`).join("; ") + ".",
    );
  }
  const comparableSet = new Set(comparable);

  const live = rows.filter((r) => !r.excluded);
  const relevantRows = live.filter((r) => r.status === "analyzed" && r.relevant);

  // ----- Totals per period (all sources) -----
  const totalsFor = (p: Period): PeriodTotals => {
    const inP = rows.filter((r) => inPeriod(new Date(r.publishedAt), p));
    const liveP = inP.filter((r) => !r.excluded);
    const relevant = liveP.filter((r) => r.status === "analyzed" && r.relevant);
    return {
      unique: liveP.length,
      relevant: relevant.length,
      irrelevant: liveP.filter((r) => r.status === "irrelevant").length,
      pending: liveP.filter((r) => r.status === "pending" || r.status === "failed").length,
      excluded: inP.length - liveP.length,
      painPoints: new Set(relevant.map((r) => r.painPointId).filter(Boolean)).size,
    };
  };
  const totals = { current: totalsFor(current), previous: totalsFor(previous) };

  if (totals.current.pending > 0) {
    warnings.push(`${totals.current.pending} discussion(s) in the current week are not analysed yet, so pain-point counts may be understated.`);
  }

  // ----- Retrospective collection note -----
  const prevRelevant = relevantRows.filter((r) => inPeriod(new Date(r.publishedAt), previous));
  const retro = prevRelevant.filter((r) => new Date(r.firstRetrievedAt).getTime() > previous.end.getTime() + 86_400_000);
  const previousShare = prevRelevant.length ? retro.length / prevRelevant.length : 0;
  const retroNote =
    previousShare > 0.5
      ? "Most previous-week discussions were retrieved after that week ended (backfill). Deleted posts and search ranking can make retrospective collection slightly incomplete, so treat changes as indicative."
      : null;

  // ----- Volume series (complete weeks + partial) -----
  const seriesOut = [...series.map((p) => ({ p, complete: true })), ...(partial ? [{ p: partial, complete: false }] : [])].map(
    ({ p, complete }) => {
      const inP = live.filter((r) => inPeriod(new Date(r.publishedAt), p));
      const bySource: Record<string, number> = {};
      for (const r of inP) bySource[r.sourceId] = (bySource[r.sourceId] ?? 0) + 1;
      return {
        label: p.label,
        start: p.start.toISOString(),
        end: p.end.toISOString(),
        complete,
        unique: inP.length,
        relevant: inP.filter((r) => r.status === "analyzed" && r.relevant).length,
        bySource,
      };
    },
  );

  // ----- Per pain point (comparable sources only) -----
  const comparableRelevant = relevantRows.filter((r) => comparableSet.has(r.sourceId) && r.painPointId);
  const byPainPoint = new Map<string, MetricRow[]>();
  for (const r of comparableRelevant) byPainPoint.set(r.painPointId!, [...(byPainPoint.get(r.painPointId!) ?? []), r]);
  // first/last seen use ALL sources (it is a fact about the pain point, not a comparison)
  const seenAll = new Map<string, { first: string; last: string; sources: Set<string> }>();
  for (const r of relevantRows) {
    if (!r.painPointId) continue;
    const s = seenAll.get(r.painPointId) ?? { first: r.publishedAt, last: r.publishedAt, sources: new Set<string>() };
    if (r.publishedAt < s.first) s.first = r.publishedAt;
    if (r.publishedAt > s.last) s.last = r.publishedAt;
    s.sources.add(r.sourceId);
    seenAll.set(r.painPointId, s);
  }

  const raw = [...byPainPoint.entries()].map(([id, list]) => {
    const weekly = series.map((p) => list.filter((r) => inPeriod(new Date(r.publishedAt), p)).length);
    const cur = list.filter((r) => inPeriod(new Date(r.publishedAt), current));
    const prev = list.filter((r) => inPeriod(new Date(r.publishedAt), previous));
    const meta = input.painPoints.get(id);
    return {
      id,
      meta,
      weekly,
      cur,
      prev,
      sourcesCurrent: [...new Set(cur.map((r) => r.sourceId))],
      sourcesBoth: new Set([...cur, ...prev].map((r) => r.sourceId)),
    };
  });
  const maxCurrent = Math.max(0, ...raw.map((r) => r.cur.length));

  const painPoints: PainPointMetric[] = raw
    // Pain points seen only before the previous week are dormant: not part of this comparison.
    .filter((r) => r.cur.length + r.prev.length > 0)
    .map((r) => {
      const c = r.cur.length;
      const p = r.prev.length;
      const unresolvedCurrent = r.cur.filter((x) => x.isUnresolved).length;
      const dissatisfiedCurrent = r.cur.filter((x) => x.toolDissatisfaction).length;
      const periodsPresent = r.weekly.filter((n) => n > 0).length;
      const sig = signalScore({
        current: c,
        previous: p,
        maxCurrent,
        periodsPresent,
        seriesLength: series.length,
        distinctSources: r.sourcesBoth.size,
        unresolvedCurrent,
        dissatisfiedCurrent,
      });
      const seen = seenAll.get(r.id);
      return {
        painPointId: r.id,
        title: r.meta?.title ?? "Unknown pain point",
        topicId: r.meta?.topicId ?? null,
        topicName: r.meta?.topicId ? (input.topics.get(r.meta.topicId)?.name ?? null) : null,
        current: c,
        previous: p,
        absChange: c - p,
        pctChange: pctChange(c, p),
        status: trendStatus(c, p),
        unresolvedCurrent,
        dissatisfiedCurrent,
        sourcesCurrent: r.sourcesCurrent,
        sourcesAll: [...(seen?.sources ?? [])],
        periodsPresent,
        weekly: r.weekly,
        firstSeen: seen?.first ?? null,
        lastSeen: seen?.last ?? null,
        signalScore: sig.score,
        signal: sig.components,
        rank: 0,
      };
    })
    .sort((a, b) => b.signalScore - a.signalScore || b.current - a.current || a.title.localeCompare(b.title));
  painPoints.forEach((p, i) => (p.rank = i + 1));

  // ----- Per topic (comparable sources, relevant discussions) -----
  const topics: TopicMetric[] = [...input.topics.entries()]
    .map(([topicId, t]) => {
      const list = relevantRows.filter((r) => comparableSet.has(r.sourceId) && r.topicId === topicId);
      const c = list.filter((r) => inPeriod(new Date(r.publishedAt), current)).length;
      const p = list.filter((r) => inPeriod(new Date(r.publishedAt), previous)).length;
      return {
        topicId,
        name: t.name,
        current: c,
        previous: p,
        absChange: c - p,
        pctChange: pctChange(c, p),
        status: trendStatus(c, p),
        painPointCount: new Set(
          list.filter((r) => inPeriod(new Date(r.publishedAt), current)).map((r) => r.painPointId).filter(Boolean),
        ).size,
      };
    })
    .sort((a, b) => b.current - a.current || a.name.localeCompare(b.name));

  // ----- Per source (all sources) -----
  const sourceIds = [...new Set([...input.enabledSources, ...rows.map((r) => r.sourceId)])];
  const sources = sourceIds.map((sourceId) => {
    const mine = live.filter((r) => r.sourceId === sourceId);
    return {
      sourceId,
      current: mine.filter((r) => inPeriod(new Date(r.publishedAt), current)).length,
      previous: mine.filter((r) => inPeriod(new Date(r.publishedAt), previous)).length,
      relevantCurrent: mine.filter((r) => r.status === "analyzed" && r.relevant && inPeriod(new Date(r.publishedAt), current)).length,
    };
  });

  // ----- Groups -----
  const ids = (s: TrendStatus) => painPoints.filter((p) => p.status === s).map((p) => p.painPointId);
  const groups = {
    new: ids("new"),
    recurring: painPoints.filter((p) => p.current > 0 && p.previous > 0).map((p) => p.painPointId),
    growing: ids("growing"),
    declining: ids("declining"),
    gone: ids("gone"),
  };

  // ----- Unclassified -----
  const currentLive = live.filter((r) => inPeriod(new Date(r.publishedAt), current));
  const unclassified = {
    relevantWithoutPainPoint: currentLive.filter((r) => r.status === "analyzed" && r.relevant && !r.painPointId).length,
    pendingAnalysis: currentLive.filter((r) => r.status === "pending").length,
    failedAnalysis: currentLive.filter((r) => r.status === "failed").length,
  };

  const comparableTotal = comparableRelevant.filter(
    (r) => inPeriod(new Date(r.publishedAt), current) || inPeriod(new Date(r.publishedAt), previous),
  ).length;
  const sufficientForTrend = comparable.length > 0 && comparableTotal >= MIN_TREND_SAMPLE * 2;
  if (!sufficientForTrend) {
    warnings.push(
      comparable.length === 0
        ? "No source was collected for both weeks, so week-on-week trends cannot be calculated yet. They become available after a collection covers both weeks."
        : `Only ${comparableTotal} relevant discussions across both weeks — too few for reliable trends. Changes are shown as counts, not percentages, where samples are small.`,
    );
  }

  const ref = (p: Period): PeriodRef => ({ start: p.start.toISOString(), end: p.end.toISOString(), label: p.label });

  return {
    version: 1,
    generatedAt: input.now.toISOString(),
    timezone: input.timezone,
    current: ref(current),
    previous: ref(previous),
    totals,
    comparableSources: comparable,
    excludedFromComparison,
    retrospective: { previousShare: round(previousShare, 2), note: retroNote },
    series: seriesOut,
    topics,
    sources,
    painPoints,
    groups,
    unclassified,
    quality: { sufficientForTrend, warnings },
  };
}
