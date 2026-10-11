// Source adapters against a MOCKED fetch (no network). These prove error
// handling and normalisation; they are not evidence that live APIs work —
// see tests/live for that.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collect } from "@/lib/sources";
import { githubAdapter } from "@/lib/sources/github";
import { hackerNewsAdapter } from "@/lib/sources/hackernews";
import { runAdapter } from "@/lib/sources/utils";
import type { FetchContext } from "@/lib/sources/types";

const ctx: FetchContext = {
  topics: [{ id: "t1", name: "Flaky tests", description: null, keywords: ["flaky tests"] }],
  keywords: [{ keyword: "flaky tests", topicId: "t1" }],
  since: new Date("2026-09-18T00:00:00Z"),
  until: new Date("2026-10-11T00:00:00Z"),
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 1000 });
  process.env.GITHUB_TOKEN = "test-token";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Hacker News adapter", () => {
  it("normalises hits, verifies the phrase locally, and skips malformed records", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      json({
        nbHits: 3,
        hits: [
          { objectID: "101", title: "Flaky tests are killing our CI", story_title: null, story_text: null, comment_text: null, author: "a", points: 12, num_comments: 4, created_at: "2026-10-05T10:00:00Z", _tags: ["story"] },
          { objectID: "102", title: null, story_title: "Ask HN", story_text: null, comment_text: "<p>tests that are flaky</p>", author: "b", points: null, num_comments: null, created_at: "2026-10-05T11:00:00Z", _tags: ["comment"] },
          { objectID: "", title: "Flaky tests", story_title: null, story_text: null, comment_text: null, author: "c", points: 1, num_comments: 0, created_at: "", _tags: ["story"] },
        ],
      }),
    ));
    const r = await runAdapter(hackerNewsAdapter, ctx);
    expect(r.status).toBe("succeeded");
    expect(r.discussions).toHaveLength(1); // 102 does not contain the exact phrase
    expect(r.discussions[0]).toMatchObject({
      sourceId: "hackernews",
      externalId: "101",
      url: "https://news.ycombinator.com/item?id=101",
      publishedAt: "2026-10-05T10:00:00.000Z",
      matchedKeywords: ["flaky tests"],
    });
    expect(r.skippedMalformed).toBe(1);
  });

  it("retries transient 5xx and then succeeds", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(json({ message: "busy" }, 503))
      .mockResolvedValueOnce(json({ nbHits: 0, hits: [] }));
    vi.stubGlobal("fetch", f);
    const r = await runAdapter(hackerNewsAdapter, ctx);
    expect(r.status).toBe("succeeded");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 400 and reports the source as failed", async () => {
    const f = vi.fn(async () => json({ message: "bad" }, 400));
    vi.stubGlobal("fetch", f);
    const r = await runAdapter(hackerNewsAdapter, ctx);
    expect(r.status).toBe("failed");
    expect(f).toHaveBeenCalledTimes(1);
    expect(r.error).toContain("HTTP 400");
  });
});

describe("GitHub adapter", () => {
  it("stops on a rate limit and reports partial/failed instead of hammering the API", async () => {
    const f = vi.fn(async () => json({ message: "You have exceeded a secondary rate limit" }, 403));
    vi.stubGlobal("fetch", f);
    const r = await runAdapter(githubAdapter, {
      ...ctx,
      topics: [ctx.topics[0], { id: "t2", name: "Other", description: null, keywords: ["slow CI"] }],
    });
    expect(f).toHaveBeenCalledTimes(1); // second query never sent
    expect(r.status).toBe("failed");
    expect(r.failedRequests).toBe(2);
  });

  it("fails cleanly without a token", async () => {
    delete process.env.GITHUB_TOKEN;
    const r = await runAdapter(githubAdapter, ctx);
    expect(r.status).toBe("failed");
    expect(r.error).toContain("GITHUB_TOKEN");
  });

  it("skips bot authors and marks open issues", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      json({
        total_count: 2,
        items: [
          { id: 1, html_url: "https://github.com/o/r/issues/1", title: "Flaky tests on main", body: "x", user: { login: "dev" }, state: "open", comments: 2, created_at: "2026-10-04T00:00:00Z", repository_url: "https://api.github.com/repos/o/r" },
          { id: 2, html_url: "https://github.com/o/r/issues/2", title: "Flaky tests report", body: "x", user: { login: "helper[bot]" }, state: "open", comments: 0, created_at: "2026-10-04T00:00:00Z", repository_url: "https://api.github.com/repos/o/r" },
        ],
      }),
    ));
    const r = await runAdapter(githubAdapter, ctx);
    expect(r.discussions).toHaveLength(1);
    expect(r.discussions[0].signals).toMatchObject({ isOpen: true, repo: "o/r" });
  });
});

describe("collect()", () => {
  it("keeps data from working sources when another source fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("hn.algolia.com")) {
        return json({ nbHits: 1, hits: [{ objectID: "7", title: "Flaky tests again", story_title: null, story_text: null, comment_text: null, author: "a", points: 1, num_comments: 0, created_at: "2026-10-05T00:00:00Z", _tags: ["story"] }] });
      }
      return json({ message: "down" }, 500);
    }));
    const out = await collect(["hackernews", "devto"], ctx);
    const byId = Object.fromEntries(out.outcomes.map((o) => [o.sourceId, o.status]));
    expect(byId).toEqual({ hackernews: "succeeded", devto: "failed" });
    expect(out.discussions).toHaveLength(1);
  }, 30_000); // DEV retries each failing tag with backoff (1s, 3s)
});
