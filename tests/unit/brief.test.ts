import { describe, expect, it } from "vitest";
import { findUnverifiedNumbers, groundBrief, type BriefModelOutput } from "@/lib/ai/brief";
import { fallbackGroups } from "@/lib/ai/consolidate";
import { parseAndValidate } from "@/lib/ai/gemini";
import { BriefModelSchema } from "@/lib/ai/brief";

const keys = {
  pKeys: new Map([["P1", "pp-uuid-1"], ["P2", "pp-uuid-2"]]),
  dKeys: new Map([["D1", "d-uuid-1"], ["D2", "d-uuid-2"], ["D3", "d-uuid-3"]]),
};

const raw: BriefModelOutput = {
  headline: "Flaky tests are the most persistent blocker this week.",
  executive_summary: [
    { text: "Flaky tests block merges (5 discussions).", pain_points: ["P1"], evidence: ["D1", "D2"] },
    { text: "Invented claim with a made-up source.", pain_points: ["P9"], evidence: ["D99"] },
  ],
  notable_changes: [],
  pain_point_insights: [
    { pain_point: "P1", likely_impact: "Slower merges", workaround: "", tools_assessment: "partially_addressed", tools_assessment_reason: "Retries help", evidence: ["D1", "D42"] },
    { pain_point: "P7", likely_impact: "x", workaround: "", tools_assessment: "unclear", tools_assessment_reason: "", evidence: [] },
  ],
  opportunities: [],
  recommendations: [
    { title: "Auto-quarantine flaky tests", kind: "product", priority: "now", rationale: "Grew 150% week on week", pain_points: ["P1"], evidence: ["D2"] },
    { title: "Unsupported idea", kind: "product", priority: "later", rationale: "No evidence", pain_points: ["P1"], evidence: [] },
  ],
  validation_questions: [{ question: "How do you handle flaky tests today?", pain_point: "P1" }],
  caveats: ["Small sample."],
};

describe("groundBrief", () => {
  const allowed = new Set([5, 2, 3, 150]);
  const { brief, validation, citations } = groundBrief(raw, keys, allowed);

  it("maps model keys to database ids", () => {
    expect(brief.executive_summary[0].evidence).toEqual(["d-uuid-1", "d-uuid-2"]);
    expect(brief.executive_summary[0].pain_points).toEqual(["pp-uuid-1"]);
    expect(brief.validation_questions[0].pain_point).toBe("pp-uuid-1");
  });

  it("drops claims whose only evidence is invented", () => {
    expect(brief.executive_summary).toHaveLength(1);
    expect(brief.recommendations.map((r) => r.title)).toEqual(["Auto-quarantine flaky tests"]);
    expect(validation.droppedItems.map((d) => d.title)).toEqual(
      expect.arrayContaining(["Invented claim with a made-up source.", "Unsupported idea", "P7"]),
    );
  });

  it("removes unknown references inside kept items and counts them", () => {
    expect(brief.pain_point_insights[0].evidence).toEqual(["d-uuid-1"]);
    expect(validation.removedReferences).toBeGreaterThanOrEqual(3);
  });

  it("produces evidence links for every kept citation", () => {
    expect(citations).toEqual(
      expect.arrayContaining([
        { discussionId: "d-uuid-2", painPointId: "pp-uuid-1", claimRef: "recommendations[0]" },
        { discussionId: "d-uuid-1", painPointId: "pp-uuid-1", claimRef: "executive_summary[0]" },
      ]),
    );
    expect(validation.evidenceCount).toBe(2);
  });

  it("has no numeric warnings when numbers come from the pack", () => {
    expect(validation.numericWarnings).toEqual([]);
  });
});

describe("findUnverifiedNumbers", () => {
  it("flags percentages and counts not supplied by code", () => {
    const w = findUnverifiedNumbers(["Up 40% with 12 discussions", "5 discussions"], new Set([5]));
    expect(w).toHaveLength(2);
    expect(w[0]).toContain("40%");
  });
});

describe("parseAndValidate (Gemini output)", () => {
  it("rejects invalid JSON with a readable error", () => {
    const r = parseAndValidate("{not json", BriefModelSchema);
    expect(r.ok).toBe(false);
  });
  it("rejects valid JSON of the wrong shape and names the field", () => {
    const r = parseAndValidate(JSON.stringify({ headline: 1 }), BriefModelSchema);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("headline");
  });
  it("accepts a schema-valid object", () => {
    expect(parseAndValidate(JSON.stringify(raw), BriefModelSchema).ok).toBe(true);
  });
});

describe("fallbackGroups (consolidation without the model)", () => {
  it("groups only identical normalised titles, never invents labels", () => {
    const g = fallbackGroups([
      { discussionId: "a", title: "Flaky tests block merges", description: "x", topicId: "t", summary: "" },
      { discussionId: "b", title: "flaky tests — block merges!", description: "y", topicId: "t", summary: "" },
      { discussionId: "c", title: "Noisy AI comments", description: "z", topicId: null, summary: "" },
    ]);
    expect(g).toHaveLength(2);
    expect(g[0].discussionIds).toEqual(["a", "b"]);
    expect(g[0].title).toBe("Flaky tests block merges");
  });
});
