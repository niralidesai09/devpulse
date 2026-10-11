// LIVE: real Gemini Flash calls on real, freshly collected discussions.
import { describe, expect, it } from "vitest";
import { analyzeDiscussions } from "@/lib/ai/analyze";
import { consolidateProposals } from "@/lib/ai/consolidate";
import { getModel } from "@/lib/ai/gemini";
import type { DiscussionRow } from "@/lib/db/types";
import { ADAPTERS } from "@/lib/sources";
import { runAdapter } from "@/lib/sources/utils";

const topics = [
  { id: "00000000-0000-4000-8000-000000000001", name: "Trust in AI code review", description: "Whether developers trust AI reviewers", keywords: ["AI code review", "code review bot", "AI reviewer"] },
  { id: "00000000-0000-4000-8000-000000000002", name: "Flaky tests", description: "Tests that pass and fail randomly", keywords: ["flaky tests", "flaky test"] },
];

describe("live Gemini Flash", () => {
  it("uses a Flash model", () => {
    expect(getModel()).toMatch(/flash/i);
  });

  it("analyses real discussions into schema-valid, grounded rows and consolidates proposals", async () => {
    const r = await runAdapter(ADAPTERS.hackernews, {
      topics,
      keywords: topics.flatMap((t) => t.keywords.map((keyword) => ({ keyword, topicId: t.id }))),
      since: new Date(Date.now() - 14 * 86_400_000),
      until: new Date(),
    });
    expect(r.discussions.length).toBeGreaterThan(0);
    const rows: DiscussionRow[] = r.discussions.slice(0, 12).map((d, i) => ({
      id: `00000000-0000-4000-9000-${String(i).padStart(12, "0")}`,
      source_id: d.sourceId, external_id: d.externalId, url: d.url, url_normalized: d.url, title: d.title, excerpt: d.excerpt,
      author: d.author, score: d.score, comment_count: d.commentCount, published_at: d.publishedAt,
      first_retrieved_at: new Date().toISOString(), last_retrieved_at: new Date().toISOString(),
      matched_keywords: d.matchedKeywords, matched_topic_ids: d.topicIds, signals: d.signals,
      analysis_status: "pending", analysis_attempts: 0, analysis_error: null, is_excluded: false, exclusion_reason: null, excluded_at: null,
    }));

    const t0 = Date.now();
    const out = await analyzeDiscussions(rows, topics, [], null);
    console.log(`analysed ${out.rows.length}/${rows.length} in ${Date.now() - t0} ms; relevant=${out.rows.filter((x) => x.is_relevant).length}; proposals=${out.proposals.length}; unverifiedQuotes=${out.unverifiedQuotes}; failed=${out.failed.map((f) => f.error)}`);
    expect(out.failed).toEqual([]);
    expect(out.rows.length + out.missing.length).toBe(rows.length);
    for (const a of out.rows) {
      if (a.evidence_quote) expect(a.quote_verified).toBe(true);
      if (!a.is_relevant) expect(a.pain_point_id).toBeNull();
    }
    for (const a of out.rows.filter((x) => x.is_relevant).slice(0, 4)) {
      const d = rows.find((x) => x.id === a.discussion_id)!;
      console.log(`  ✔ ${d.title.slice(0, 70)}\n    → ${a.problem_summary}\n    quote: ${a.evidence_quote ?? "(none)"} | unresolved=${a.is_unresolved} (${a.unresolved_evidence})`);
    }
    const c = await consolidateProposals(out.proposals, [], topics);
    console.log(`consolidated ${out.proposals.length} proposals → ${c.groups.length} pain points (fallback=${c.usedFallback})`);
    for (const g of c.groups) console.log(`  • ${g.title} (${g.discussionIds.length})`);
    expect(c.groups.flatMap((g) => g.discussionIds).sort()).toEqual(out.proposals.map((p) => p.discussionId).sort());
  });
});
