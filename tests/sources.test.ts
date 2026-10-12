// Source layer: normalisation, deduplication, URL validation, source status.
// No network: fetch is replaced with canned API responses.

import { afterEach, describe, expect, it, vi } from "vitest";
import { dedupePosts, hasValidSourceUrl, normaliseUrl } from "@/lib/sources";
import { hackerNewsAdapter } from "@/lib/sources/hackernews";
import type { SourcePost } from "@/lib/sources/types";
import { cleanText, matchTopic, runSafely, snippetAround } from "@/lib/sources/utils";

const topics = [
  { id: "t-flaky", name: "Flaky tests", description: null, keywords: ["flaky test"] },
  { id: "t-ai", name: "AI review", description: null, keywords: ["AI code review"] },
];

function post(over: Partial<SourcePost> = {}): SourcePost {
  return {
    source: "github",
    externalId: "1",
    url: "https://github.com/o/r/issues/1",
    title: "Flaky test in CI",
    snippet: "",
    author: null,
    score: 0,
    commentCount: 0,
    postedAt: "2026-10-10T00:00:00Z",
    retrievedAt: "2026-10-12T00:00:00Z",
    matchedKeyword: "flaky test",
    topicId: "t-flaky",
    signals: {},
    ...over,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("1. source-record normalisation", () => {
  it("strips HTML and decodes entities without inventing text", () => {
    expect(cleanText("<p>It&#39;s <b>flaky</b> &amp; slow</p>")).toBe("It's flaky & slow");
  });

  it("keeps the matched keyword inside the stored excerpt", () => {
    const body = "x ".repeat(400) + "this flaky test fails on Fridays " + "y ".repeat(400);
    const snip = snippetAround(body, "flaky test");
    expect(snip).toContain("flaky test");
    expect(snip.length).toBeLessThanOrEqual(500);
  });

  it("prefers the topic whose keyword was searched", () => {
    const m = matchTopic("flaky test and AI code review", topics, "t-ai");
    expect(m).toEqual({ topicId: "t-ai", keyword: "AI code review" });
  });

  it("Hacker News adapter keeps id, canonical URL, original timestamp and adds retrieval time", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            nbPages: 1,
            nbHits: 1,
            hits: [
              {
                objectID: "424242",
                title: null,
                story_title: "Ask HN: CI pain",
                story_text: null,
                comment_text: "<p>Our flaky test suite blocks merges</p>",
                author: "dev1",
                points: null,
                num_comments: null,
                created_at: "2026-10-09T10:11:12.000Z",
                _tags: ["comment"],
              },
            ],
          }),
        ),
      ),
    );
    const res = await hackerNewsAdapter.fetchPosts([topics[0]], new Date("2026-10-05T00:00:00Z"));
    expect(res.status).toBe("ok");
    expect(res.posts).toHaveLength(1);
    const p = res.posts[0];
    expect(p.externalId).toBe("424242");
    expect(p.url).toBe("https://news.ycombinator.com/item?id=424242");
    expect(p.postedAt).toBe("2026-10-09T10:11:12.000Z"); // original time, untouched
    expect(new Date(p.retrievedAt).getTime()).toBeGreaterThan(new Date(p.postedAt).getTime());
    expect(p.title).toBe("Comment on: Ask HN: CI pain");
    expect(p.snippet).toBe("Our flaky test suite blocks merges");
  });

  it("records a coverage note instead of silently truncating", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ nbPages: 9, nbHits: 812, hits: [] })));
    vi.stubGlobal("fetch", fetchMock);
    const res = await hackerNewsAdapter.fetchPosts([topics[0]], new Date());
    expect(fetchMock).toHaveBeenCalledTimes(5); // MAX_PAGES
    expect(res.notes[0]).toMatch(/812 matches, kept the newest 500/);
    expect(res.status).toBe("ok"); // a coverage limit is not a failure
  });
});

describe("2. stable-ID and URL deduplication", () => {
  it("merges the same source id even when URLs differ", () => {
    const out = dedupePosts([post({ url: "https://github.com/o/r/issues/1" }), post({ url: "https://github.com/o/r/issues/1?x=1" })]);
    expect(out).toHaveLength(1);
  });

  it("merges the same canonical URL (hash / trailing slash / host case)", () => {
    const out = dedupePosts([
      post({ externalId: "a", url: "https://GitHub.com/o/r/issues/1/" }),
      post({ externalId: "b", url: "https://github.com/o/r/issues/1#comment" }),
    ]);
    expect(out).toHaveLength(1);
    expect(normaliseUrl("https://GitHub.com/o/r/issues/1/#x")).toBe("https://github.com/o/r/issues/1");
  });

  it("keeps the more-engaged copy and never merges different discussions", () => {
    const out = dedupePosts([post({ score: 1 }), post({ score: 9 }), post({ externalId: "2", url: "https://github.com/o/r/issues/2" })]);
    expect(out).toHaveLength(2);
    expect(out.find((p) => p.externalId === "1")?.score).toBe(9);
  });
});

describe("9. missing or invalid source URLs", () => {
  it("accepts only https links on the post's own source site", () => {
    expect(hasValidSourceUrl(post())).toBe(true);
    expect(hasValidSourceUrl(post({ url: "http://github.com/o/r/issues/1" }))).toBe(false);
    expect(hasValidSourceUrl(post({ url: "https://evil.example/o/r/issues/1" }))).toBe(false);
    expect(hasValidSourceUrl(post({ source: "devto", url: "https://github.com/x" }))).toBe(false);
    expect(hasValidSourceUrl(post({ url: "" }))).toBe(false);
    expect(hasValidSourceUrl(post({ source: "hackernews", url: "https://news.ycombinator.com/item?id=1" }))).toBe(true);
  });
});

describe("10a. failed and partial source collection", () => {
  it("ok / partial / failed are reported honestly", async () => {
    const ok = await runSafely("github", async () => ({ posts: [post()], errors: [], requests: 3 }));
    const partial = await runSafely("github", async () => ({ posts: [post()], errors: ["HTTP 403"], requests: 3 }));
    const failed = await runSafely("github", async () => ({ posts: [], errors: ["a", "b", "c"], requests: 3 }));
    const crashed = await runSafely("github", async () => {
      throw new Error("boom");
    });
    expect([ok.status, ok.ok]).toEqual(["ok", true]);
    expect([partial.status, partial.ok]).toEqual(["partial", false]);
    expect(partial.error).toMatch(/1\/3 requests failed/);
    expect([failed.status, crashed.status]).toEqual(["failed", "failed"]);
  });
});
