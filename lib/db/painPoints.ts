// Canonical pain points (semantic groups of discussions) and the PM's
// decisions about them.

import { check, getDb } from "./client";
import type { Decision, DecisionRow, PainPointRow } from "./types";

export async function listPainPoints(): Promise<PainPointRow[]> {
  const res = await getDb().from("pain_points").select("*").is("merged_into", null).order("created_at");
  return check(res, "Could not load pain points") as PainPointRow[];
}

/** Pain points to offer the model when it classifies new discussions (most recently used first). */
export async function painPointsForPrompt(limit = 80): Promise<PainPointRow[]> {
  const db = getDb();
  const res = await db
    .from("pain_points")
    .select("*")
    .is("merged_into", null)
    .order("updated_at", { ascending: false })
    .limit(limit);
  return check(res, "Could not load pain points") as PainPointRow[];
}

export async function getPainPoint(id: string): Promise<PainPointRow | null> {
  const res = await getDb().from("pain_points").select("*").eq("id", id).maybeSingle();
  return check(res, "Could not load pain point") as PainPointRow | null;
}

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "pain-point"
  );
}

/** Insert pain points; a clashing slug gets a numeric suffix. Returns ids in input order. */
export async function createPainPoints(
  items: { title: string; description: string; topicId: string | null; runId: string | null }[],
): Promise<string[]> {
  const db = getDb();
  const ids: string[] = [];
  for (const item of items) {
    const base = slugify(item.title);
    for (let n = 1; n <= 20; n++) {
      const slug = n === 1 ? base : `${base}-${n}`;
      const { data, error } = await db
        .from("pain_points")
        .insert({
          title: item.title.slice(0, 120),
          description: item.description.slice(0, 600),
          topic_id: item.topicId,
          slug,
          created_by: "ai",
          created_run_id: item.runId,
        })
        .select("id")
        .single();
      if (!error) {
        ids.push(data.id);
        break;
      }
      if (error.code !== "23505") throw new Error(`Could not create pain point: ${error.message}`);
      if (n === 20) throw new Error(`Could not find a free slug for "${item.title}"`);
    }
  }
  return ids;
}

/** Touch updated_at so recently active pain points are offered to the model first. */
export async function touchPainPoints(ids: string[]) {
  if (!ids.length) return;
  check(
    await getDb().from("pain_points").update({ updated_at: new Date().toISOString() }).in("id", ids),
    "Could not update pain points",
  );
}

// ---------------------------------------------------------------------
// Product Decision Workspace (human decisions, append-only)
// ---------------------------------------------------------------------

export const DECISIONS: { value: Decision; label: string; hint: string }[] = [
  { value: "investigate", label: "Investigate", hint: "Dig into the evidence and the codebase impact." },
  { value: "validate", label: "Validate with users", hint: "Take it to customer interviews before committing." },
  { value: "backlog", label: "Add to backlog", hint: "Worth building; schedule it." },
  { value: "monitor", label: "Monitor", hint: "Keep watching the signal for another few weeks." },
  { value: "dismiss", label: "Dismiss", hint: "Not relevant to our product or strategy." },
];

export async function addDecision(input: {
  painPointId: string;
  decision: Decision;
  rationale: string | null;
  reportId: string | null;
}) {
  check(
    await getDb().from("pain_point_decisions").insert({
      pain_point_id: input.painPointId,
      decision: input.decision,
      rationale: input.rationale,
      report_id: input.reportId,
    }),
    "Could not save decision",
  );
}

export async function listDecisions(painPointId?: string): Promise<(DecisionRow & { pain_point: { id: string; title: string } | null })[]> {
  let q = getDb()
    .from("pain_point_decisions")
    .select("*, pain_point:pain_points(id, title)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (painPointId) q = q.eq("pain_point_id", painPointId);
  return check(await q, "Could not load decisions") as (DecisionRow & { pain_point: { id: string; title: string } | null })[];
}

/** The latest decision per pain point. */
export async function latestDecisions(): Promise<Map<string, DecisionRow>> {
  const rows = await listDecisions();
  const out = new Map<string, DecisionRow>();
  for (const r of rows) if (!out.has(r.pain_point_id)) out.set(r.pain_point_id, r);
  return out;
}

/** Every discussion assigned to a pain point, with the model's interpretation (newest first). */
export async function listPainPointDiscussions(painPointId: string) {
  const res = await getDb()
    .from("discussion_analysis")
    .select(
      "problem_summary, evidence_quote, quote_verified, is_unresolved, unresolved_evidence, workaround, tools_mentioned, tool_dissatisfaction, frustration, severity, " +
        "discussion:discussions!inner(id, source_id, title, url, author, published_at, score, comment_count, is_excluded, signals)",
    )
    .eq("pain_point_id", painPointId)
    .limit(500);
  const rows = check(res, "Could not load pain point discussions") as unknown as {
    problem_summary: string | null;
    evidence_quote: string | null;
    quote_verified: boolean;
    is_unresolved: boolean | null;
    unresolved_evidence: string | null;
    workaround: string | null;
    tools_mentioned: string[];
    tool_dissatisfaction: boolean | null;
    frustration: string | null;
    severity: number | null;
    discussion: {
      id: string;
      source_id: string;
      title: string;
      url: string;
      author: string | null;
      published_at: string;
      score: number | null;
      comment_count: number | null;
      is_excluded: boolean;
      signals: Record<string, unknown>;
    };
  }[];
  return rows.sort((a, b) => b.discussion.published_at.localeCompare(a.discussion.published_at));
}

/** Active pain points with discussion counts — input for the merge pass. */
export async function listMergeCandidates(limit = 120) {
  const db = getDb();
  const [pps, counts] = await Promise.all([
    db.from("pain_points").select("id, title, description, created_at, topic:topics(name)").is("merged_into", null).limit(limit),
    db.from("discussion_analysis").select("pain_point_id").not("pain_point_id", "is", null).limit(10000),
  ]);
  const n = new Map<string, number>();
  for (const r of (check(counts, "Could not count discussions") ?? []) as { pain_point_id: string }[]) {
    n.set(r.pain_point_id, (n.get(r.pain_point_id) ?? 0) + 1);
  }
  return ((check(pps, "Could not load pain points") ?? []) as unknown as {
    id: string;
    title: string;
    description: string;
    created_at: string;
    topic: { name: string } | null;
  }[]).map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    topicName: p.topic?.name ?? null,
    discussions: n.get(p.id) ?? 0,
    createdAt: p.created_at,
  }));
}

/** Apply one merge: move discussions to the survivor, keep merged rows (merged_into) for traceability. */
export async function applyMerge(plan: { survivorId: string; mergedIds: string[]; title: string; description: string }) {
  const db = getDb();
  check(
    await db.from("discussion_analysis").update({ pain_point_id: plan.survivorId }).in("pain_point_id", plan.mergedIds),
    "Could not move discussions to the merged pain point",
  );
  check(await db.from("pain_points").update({ merged_into: plan.survivorId }).in("id", plan.mergedIds), "Could not mark merged pain points");
  check(
    await db.from("pain_points").update({ title: plan.title, description: plan.description }).eq("id", plan.survivorId),
    "Could not update merged pain point",
  );
}
