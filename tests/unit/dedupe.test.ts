import { describe, expect, it } from "vitest";
import { dedupeDiscussions } from "@/lib/sources";
import type { CollectedDiscussion } from "@/lib/sources/types";

const d = (p: Partial<CollectedDiscussion>): CollectedDiscussion => ({
  sourceId: "hackernews",
  externalId: "1",
  url: "https://news.ycombinator.com/item?id=1",
  title: "t",
  excerpt: "",
  author: null,
  score: 1,
  commentCount: 0,
  publishedAt: "2026-10-05T00:00:00.000Z",
  matchedKeywords: ["flaky tests"],
  topicIds: ["t1"],
  signals: {},
  ...p,
});

describe("dedupeDiscussions", () => {
  it("keeps one record per (source, external id) and merges keywords/topics", () => {
    const { discussions, duplicates } = dedupeDiscussions([
      d({}),
      d({ matchedKeywords: ["slow CI"], topicIds: ["t2"], score: 9 }),
    ]);
    expect(discussions).toHaveLength(1);
    expect(duplicates).toBe(1);
    expect(discussions[0].matchedKeywords).toEqual(["flaky tests", "slow CI"]);
    expect(discussions[0].topicIds).toEqual(["t1", "t2"]);
    expect(discussions[0].score).toBe(9);
  });

  it("uses the normalised URL as a secondary key", () => {
    const { discussions } = dedupeDiscussions([
      d({ sourceId: "devto", externalId: "a", url: "https://dev.to/x/post/" }),
      d({ sourceId: "devto", externalId: "b", url: "https://dev.to/x/post?utm_source=rss#comments" }),
    ]);
    expect(discussions).toHaveLength(1);
  });

  it("does not merge different discussions", () => {
    const { discussions } = dedupeDiscussions([d({}), d({ externalId: "2", url: "https://news.ycombinator.com/item?id=2" })]);
    expect(discussions).toHaveLength(2);
  });

  it("does not mutate its input", () => {
    const a = d({});
    dedupeDiscussions([a, d({ matchedKeywords: ["x"] })]);
    expect(a.matchedKeywords).toEqual(["flaky tests"]);
  });
});
