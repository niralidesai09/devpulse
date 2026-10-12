// Pipeline: attribution persistence, run status, cross-source counting,
// week-on-week maths, zero baselines and the Opportunity Score.

import { describe, expect, it } from "vitest";
import type { ClassifiedPost } from "@/lib/ai/classify";
import { decideRunStatus, toPostRow } from "@/lib/pipeline/run";
import {
  compareCounts,
  computeTopicStats,
  formatRunComparison,
  formatTrend,
  growthFromCounts,
  type PreviousRun,
} from "@/lib/pipeline/scoring";

const topics = [
  { id: "A", name: "Flaky tests", description: null, keywords: [] },
  { id: "B", name: "AI review", description: null, keywords: [] },
];

function cp(topicId: string | null, source: ClassifiedPost["source"], over: Partial<ClassifiedPost["classification"]> = {}, id = Math.random().toString()): ClassifiedPost {
  return {
    source,
    externalId: id,
    url: `https://example/${id}`,
    title: "t",
    snippet: "s",
    author: null,
    score: 0,
    commentCount: 0,
    postedAt: "2026-10-10T00:00:00Z",
    retrievedAt: "2026-10-12T00:00:00Z",
    matchedKeyword: "k",
    topicId: "A",
    signals: {},
    classification: { topicId, painPoint: "p", isUnresolved: true, unresolvedReason: "r", sentiment: -0.5, severity: 4, competitors: [], ...over },
  };
}

const hn = (thisWeek: number, lastWeek: number) => ({ thisWeek, lastWeek, bySource: { hackernews: { thisWeek, lastWeek } } });

describe("3. source attribution persistence", () => {
  it("every row keeps source, id, URL, original time, retrieval time and run", () => {
    const p = cp("A", "github", {}, "5801479681");
    const row = toPostRow("run-1", p);
    expect(row).toMatchObject({
      run_id: "run-1",
      source: "github",
      external_id: "5801479681",
      url: p.url,
      posted_at: p.postedAt,
      retrieved_at: p.retrievedAt,
      matched_keyword: "k",
      title: "t",
      snippet: "s",
    });
    // AI interpretation sits in its own columns, separate from source text.
    expect(row).toMatchObject({ topic_id: "A", pain_point: "p", is_unresolved: true, severity: 4 });
  });
});

describe("10b. failed and partial runs", () => {
  const base = { classifyErrors: 0, baselineErrors: 0, radarError: null, briefError: null, emailError: null };
  it("success only when every source and every step worked", () => {
    expect(decideRunStatus({ ...base, sources: [{ status: "ok" }, { status: "ok" }] })).toBe("success");
  });
  it("a partly failed source can never be reported as success", () => {
    expect(decideRunStatus({ ...base, sources: [{ status: "ok" }, { status: "partial" }] })).toBe("partial");
    expect(decideRunStatus({ ...base, sources: [{ status: "failed" }] })).toBe("partial");
  });
  it("brief, email or AI batch failures also make the run partial", () => {
    expect(decideRunStatus({ ...base, sources: [{ status: "ok" }], emailError: "403" })).toBe("partial");
    expect(decideRunStatus({ ...base, sources: [{ status: "ok" }], classifyErrors: 1 })).toBe("partial");
  });
});

describe("5. cross-source metric aggregation", () => {
  it("mentions count every relevant post of a topic across all sources, once each", () => {
    const posts = [cp("A", "hackernews"), cp("A", "github"), cp("A", "stackoverflow"), cp("A", "devto"), cp("B", "github"), cp(null, "github")];
    const stats = computeTopicStats(topics, posts, {});
    expect(stats.find((s) => s.topicId === "A")?.mentionCount).toBe(4);
    expect(stats.find((s) => s.topicId === "B")?.mentionCount).toBe(1);
    // "other" posts (topic null) are not counted in any topic.
    expect(stats.reduce((n, s) => n + s.mentionCount, 0)).toBe(5);
  });
});

describe("6 + 7. week-on-week maths and zero baselines", () => {
  it("states a direction only with enough data", () => {
    expect(compareCounts(2, 0)).toEqual({ trend: "low_data", changePct: null });
    expect(compareCounts(0, 0)).toEqual({ trend: "low_data", changePct: null });
    expect(compareCounts(6, 0)).toEqual({ trend: "new", changePct: null });
    expect(compareCounts(19, 11)).toEqual({ trend: "up", changePct: 73 });
    expect(compareCounts(11, 19)).toEqual({ trend: "down", changePct: -42 });
    expect(compareCounts(20, 20)).toEqual({ trend: "flat", changePct: 0 });
  });

  it("never produces NaN or Infinity", () => {
    for (let a = 0; a <= 12; a++) {
      for (let b = 0; b <= 12; b++) {
        const { changePct } = compareCounts(a, b);
        if (changePct !== null) expect(Number.isFinite(changePct)).toBe(true);
        expect(Number.isFinite(growthFromCounts(a, b))).toBe(true);
      }
    }
  });

  it("too-few-to-compare topics get a neutral growth factor (×1)", () => {
    const stats = computeTopicStats(topics, [cp("A", "github")], { A: hn(2, 0), B: hn(9, 20) });
    const a = stats.find((s) => s.topicId === "A")!;
    expect(a.trend).toBe("low_data");
    expect(a.scoreGrowth).toBe(1);
    expect(a.trendDetail.growthBasis).toBe("none");
  });

  it("labels always carry the counts and never claim a direction from tiny numbers", () => {
    expect(formatTrend("low_data", null, 2, 0)).toBe("0 → 2 (too few to compare)");
    expect(formatTrend("up", 73, 19, 11)).toBe("11 → 19 (▲ 73%)");
    expect(formatTrend("new", null, 6, 0)).toBe("0 → 6 (new in HN data)");
  });

  it("uses a comparable previous run (all sources) before the HN-only signal", () => {
    const prev: PreviousRun = { runId: "r0", windowEnd: "x", mentionsByTopic: { A: 2 }, comparable: true, reason: null };
    const posts = [cp("A", "github"), cp("A", "devto"), cp("A", "hackernews"), cp("A", "github"), cp("A", "github"), cp("A", "github")];
    const a = computeTopicStats(topics, posts, { A: hn(9, 20) }, prev).find((s) => s.topicId === "A")!;
    expect(a.trendDetail.growthBasis).toBe("previous_run");
    expect(a.scoreGrowth).toBe(1.8); // (6 + 3) / (2 + 3)
    expect(formatRunComparison(6, a.trendDetail)).toBe("2 → 6 (▲ 200%)");

    const notComparable = computeTopicStats(topics, posts, { A: hn(9, 20) }, { ...prev, comparable: false, reason: "a source was incomplete" });
    expect(notComparable[0].trendDetail.growthBasis).toBe("hn_keywords");
    expect(formatRunComparison(6, notComparable[0].trendDetail)).toMatch(/not comparable/);
  });
});

describe("Opportunity Score", () => {
  it("is deterministic, multiplies out exactly and ranks the top topic at 100", () => {
    const posts = [cp("A", "github"), cp("A", "devto", { isUnresolved: false }), cp("B", "github", { severity: 2 })];
    const stats = computeTopicStats(topics, posts, { A: hn(10, 5), B: hn(1, 1) });
    for (const s of stats) {
      const product = Math.round(s.scoreFrequency * s.scoreGrowth * s.scoreUnresolved * s.scoreSeverity * 1e4) / 1e4;
      expect(product).toBe(s.scoreRaw);
    }
    expect(Math.max(...stats.map((s) => s.opportunityScore))).toBe(100);
    expect(computeTopicStats(topics, posts, { A: hn(10, 5), B: hn(1, 1) })).toEqual(stats); // same input, same output
  });

  it("no posts at all gives 0, not NaN", () => {
    const stats = computeTopicStats(topics, [], {});
    expect(stats.every((s) => s.opportunityScore === 0 && s.avgSeverity === null)).toBe(true);
  });
});
