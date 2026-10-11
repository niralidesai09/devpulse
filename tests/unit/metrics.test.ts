import { describe, expect, it } from "vitest";
import { computeReportMetrics, coveredSources, pctChange, signalScore, trendStatus } from "@/lib/analytics/metrics";
import type { MetricRow } from "@/lib/db/discussions";
import type { SourceRunRow } from "@/lib/db/types";
import { latestCompletePeriod, periodSeries } from "@/lib/time/periods";

describe("pctChange", () => {
  it("is null for a zero baseline (never Infinity or 100%)", () => {
    expect(pctChange(5, 0)).toBeNull();
    expect(pctChange(0, 0)).toBeNull();
  });
  it("rounds to whole percent", () => {
    expect(pctChange(4, 3)).toBe(33);
    expect(pctChange(1, 4)).toBe(-75);
  });
});

describe("trendStatus", () => {
  it("labels new and gone", () => {
    expect(trendStatus(3, 0)).toBe("new");
    expect(trendStatus(0, 3)).toBe("gone");
  });
  it("refuses to call tiny samples growing", () => {
    expect(trendStatus(2, 1)).toBe("insufficient_data");
  });
  it("needs both an absolute and a relative move", () => {
    expect(trendStatus(6, 3)).toBe("growing");
    expect(trendStatus(3, 6)).toBe("declining");
    expect(trendStatus(11, 10)).toBe("stable");
    expect(trendStatus(41, 40)).toBe("stable");
  });
});

describe("signalScore", () => {
  const base = { current: 5, previous: 5, maxCurrent: 10, periodsPresent: 4, seriesLength: 4, distinctSources: 3, unresolvedCurrent: 5, dissatisfiedCurrent: 5 };
  it("is 0..100 and rises with each factor", () => {
    const s = signalScore(base).score;
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(100);
    expect(signalScore({ ...base, unresolvedCurrent: 0 }).score).toBeLessThan(s);
    expect(signalScore({ ...base, distinctSources: 1 }).score).toBeLessThan(s);
  });
  it("damps growth on small baselines", () => {
    // 0 → 3 is not treated as infinite growth
    expect(signalScore({ ...base, current: 3, previous: 0 }).components.growth).toBe(1);
    expect(signalScore({ ...base, current: 2, previous: 1 }).components.growth).toBe(0.75);
  });
  it("ignores engagement entirely (popularity ≠ relevance)", () => {
    expect(Object.keys(signalScore(base).components)).not.toContain("engagement");
  });
});

// --- Full computation over a small, hand-checkable fixture -------------
const now = new Date("2026-10-11T10:00:00Z");
const tz = "Asia/Kolkata";
const current = latestCompletePeriod(now, tz, 5); // 2 Oct – 8 Oct (IST)
const series = periodSeries(current, 4, tz);
const previous = series[2];
const inCur = (h: number) => new Date(current.start.getTime() + h * 3600_000).toISOString();
const inPrev = (h: number) => new Date(previous.start.getTime() + h * 3600_000).toISOString();

let n = 0;
function row(p: Partial<MetricRow>): MetricRow {
  n++;
  return {
    id: `d${n}`,
    sourceId: "hackernews",
    publishedAt: inCur(1),
    firstRetrievedAt: inCur(2),
    status: "analyzed",
    excluded: false,
    score: 1,
    commentCount: 0,
    relevant: true,
    topicId: "t1",
    painPointId: "pp1",
    isUnresolved: true,
    toolDissatisfaction: false,
    severity: 3,
    ...p,
  };
}

function sourceRun(source: string, start: Date, end: Date, status: SourceRunRow["status"] = "succeeded"): SourceRunRow {
  return {
    id: `${source}-${start.toISOString()}`, run_id: "r", source_id: source, status,
    window_start: start.toISOString(), window_end: end.toISOString(), requests: 1, failed_requests: 0,
    fetched_count: 0, new_count: 0, duplicate_count: 0, truncated: false, error: null, duration_ms: 1, created_at: now.toISOString(),
  };
}

const fullCoverage = [sourceRun("hackernews", series[0].start, now), sourceRun("github", series[0].start, now)];

function compute(rows: MetricRow[], sourceRuns = fullCoverage) {
  return computeReportMetrics({
    rows,
    series,
    partial: null,
    painPoints: new Map([
      ["pp1", { title: "Flaky tests block merges", topicId: "t1" }],
      ["pp2", { title: "Noisy AI review comments", topicId: "t2" }],
    ]),
    topics: new Map([["t1", { name: "Flaky tests" }], ["t2", { name: "AI review" }]]),
    sourceRuns,
    enabledSources: ["hackernews", "github"],
    timezone: tz,
    now,
  });
}

describe("computeReportMetrics", () => {
  const rows = [
    // pp1: 5 current (2 sources), 2 previous → growing
    row({}), row({}), row({}), row({ sourceId: "github" }), row({ sourceId: "github", isUnresolved: false }),
    row({ publishedAt: inPrev(5) }), row({ publishedAt: inPrev(6) }),
    // pp2: 0 current, 2 previous → gone
    row({ painPointId: "pp2", topicId: "t2", publishedAt: inPrev(1) }),
    row({ painPointId: "pp2", topicId: "t2", publishedAt: inPrev(2) }),
    // noise that must NOT be counted as pain points
    row({ status: "irrelevant", relevant: false, painPointId: null, topicId: null }),
    row({ status: "pending", relevant: null, painPointId: null, topicId: null }),
    row({ excluded: true }),
  ];
  const m = compute(rows);

  it("counts unique, relevant, pending and excluded separately", () => {
    expect(m.totals.current).toEqual({ unique: 7, relevant: 5, irrelevant: 1, pending: 1, excluded: 1, painPoints: 1 });
    expect(m.totals.previous.relevant).toBe(4);
  });

  it("computes week-on-week per pain point from real rows", () => {
    const pp1 = m.painPoints.find((p) => p.painPointId === "pp1")!;
    expect(pp1).toMatchObject({ current: 5, previous: 2, absChange: 3, pctChange: 150, status: "growing", unresolvedCurrent: 4 });
    expect(pp1.sourcesCurrent.sort()).toEqual(["github", "hackernews"]);
    const pp2 = m.painPoints.find((p) => p.painPointId === "pp2")!;
    expect(pp2).toMatchObject({ current: 0, previous: 2, pctChange: -100, status: "gone" });
    expect(m.groups.growing).toEqual(["pp1"]);
    expect(m.groups.gone).toEqual(["pp2"]);
  });

  it("excluded discussions never count", () => {
    const pp1 = m.painPoints.find((p) => p.painPointId === "pp1")!;
    expect(pp1.current).toBe(5); // the excluded row is not the 6th
  });

  it("flags pending analysis in the warnings", () => {
    expect(m.quality.warnings.join(" ")).toMatch(/not analysed yet/);
  });

  it("compares like-for-like: a source missing in one week is left out of trends", () => {
    const onlyCurrentForGithub = [
      sourceRun("hackernews", series[0].start, now),
      sourceRun("github", current.start, now), // github did not cover the previous week
    ];
    const m2 = compute(rows, onlyCurrentForGithub);
    expect(m2.comparableSources).toEqual(["hackernews"]);
    expect(m2.excludedFromComparison[0]).toMatchObject({ sourceId: "github" });
    expect(m2.painPoints.find((p) => p.painPointId === "pp1")!.current).toBe(3); // HN only
  });

  it("failed source runs do not count as coverage", () => {
    expect(coveredSources(current, [sourceRun("github", series[0].start, now, "failed")]).size).toBe(0);
  });

  it("reports insufficient data honestly when the sample is tiny", () => {
    const tiny = compute([row({}), row({ publishedAt: inPrev(3) })]);
    expect(tiny.quality.sufficientForTrend).toBe(false);
    expect(tiny.painPoints[0].status).toBe("insufficient_data");
    expect(tiny.painPoints[0].pctChange).toBe(0);
  });

  it("handles an empty database without NaN or crashes", () => {
    const empty = compute([], []);
    expect(empty.painPoints).toEqual([]);
    expect(empty.totals.current.unique).toBe(0);
    expect(empty.quality.sufficientForTrend).toBe(false);
    expect(JSON.stringify(empty)).not.toMatch(/NaN|Infinity/);
  });

  it("notes when previous-week data was backfilled", () => {
    const backfilled = compute([
      row({ publishedAt: inPrev(1), firstRetrievedAt: now.toISOString() }),
      row({ publishedAt: inPrev(2), firstRetrievedAt: now.toISOString() }),
    ]);
    expect(backfilled.retrospective.previousShare).toBe(1);
    expect(backfilled.retrospective.note).toMatch(/retrieved after that week ended/);
  });
});
