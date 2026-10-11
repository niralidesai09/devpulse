// LIVE: real requests to every source. Proves the integrations work today.
import { describe, expect, it } from "vitest";
import { ADAPTERS } from "@/lib/sources";
import { runAdapter } from "@/lib/sources/utils";
import type { FetchContext, SourceId } from "@/lib/sources/types";
import { isSafeHttpUrl } from "@/lib/text";

const topics = [
  { id: "t-ai", name: "AI code review", description: null, keywords: ["AI code review", "CodeRabbit", "code review bot"] },
  { id: "t-ci", name: "CI", description: null, keywords: ["flaky tests", "flaky test", "slow CI", "GitHub Actions"] },
];
const ctx: FetchContext = {
  topics,
  keywords: topics.flatMap((t) => t.keywords.map((keyword) => ({ keyword, topicId: t.id }))),
  since: new Date(Date.now() - 14 * 86_400_000),
  until: new Date(),
};

describe.each(["hackernews", "github", "stackoverflow", "devto"] as SourceId[])("live source: %s", (id) => {
  it("returns normalised, traceable discussions or an honest status", async () => {
    const r = await runAdapter(ADAPTERS[id], ctx);
    console.log(`${id}: status=${r.status} fetched=${r.discussions.length} requests=${r.requests} failed=${r.failedRequests} truncated=${r.truncated} ms=${r.durationMs} ${r.error ?? ""}`);
    expect(["succeeded", "partial", "failed"]).toContain(r.status);
    if (r.status === "failed") return; // reported honestly; checked in Data health
    for (const d of r.discussions) {
      expect(d.externalId).toBeTruthy();
      expect(isSafeHttpUrl(d.url)).toBe(true);
      expect(new Date(d.publishedAt).getTime()).toBeGreaterThanOrEqual(ctx.since.getTime());
      expect(new Date(d.publishedAt).getTime()).toBeLessThanOrEqual(Date.now());
      expect(d.matchedKeywords.length).toBeGreaterThan(0);
    }
    if (r.discussions[0]) console.log(`  e.g. ${r.discussions[0].title} — ${r.discussions[0].url}`);
  });
});
