// Analysis stage: pending discussions → Gemini (Stage A) → consolidate new
// pain points (Stage B) → store. Incremental: only discussions never
// analysed (or failed < MAX attempts) are sent, so weekly cost stays small
// and a failure never loses raw data — it is simply retried next run.

import { analyzeDiscussions } from "@/lib/ai/analyze";
import { consolidateProposals } from "@/lib/ai/consolidate";
import { MAX_ANALYZE_PER_RUN } from "@/lib/config";
import type { ActiveConfig } from "@/lib/db/config";
import {
  assignPainPoint,
  countAnalysisQueue,
  getAnalysisQueue,
  markAnalysisFailed,
  saveAnalyses,
} from "@/lib/db/discussions";
import { proposeMerges } from "@/lib/ai/mergePainPoints";
import { applyMerge, createPainPoints, listMergeCandidates, painPointsForPrompt, touchPainPoints } from "@/lib/db/painPoints";
import type { Logger } from "@/lib/log";

export async function runAnalysis(input: {
  runId: string | null;
  config: ActiveConfig;
  log: Logger;
  shouldStop: () => boolean;
  limit?: number;
}) {
  const { runId, config, log, shouldStop } = input;
  const queue = await getAnalysisQueue(input.limit ?? MAX_ANALYZE_PER_RUN);
  const warnings: string[] = [];
  if (!queue.length) {
    log.info("analyze.empty");
    return { analyzed: 0, relevant: 0, irrelevant: 0, failed: 0, newPainPoints: 0, pending: (await countAnalysisQueue()).pending, warnings };
  }

  const existing = await painPointsForPrompt();
  log.info("analyze.start", { queued: queue.length, existingPainPoints: existing.length });
  const out = await analyzeDiscussions(queue, config.topics, existing, runId, shouldStop);

  await saveAnalyses(out.rows);
  if (out.unverifiedQuotes) warnings.push(`${out.unverifiedQuotes} model quote(s) could not be found verbatim in the source and were discarded.`);

  // Failed batches and skipped items: record the attempt; raw data is untouched.
  let failed = 0;
  for (const f of out.failed) {
    failed += f.discussions.length;
    await markAnalysisFailed(f.discussions, f.error);
    log.warn("analyze.batch_failed", { count: f.discussions.length, error: f.error.slice(0, 300) });
  }
  if (out.failed.length) warnings.push(`${failed} discussion(s) could not be analysed (${out.failed[0].error.slice(0, 160)}). They will be retried.`);
  if (out.missing.length) {
    await markAnalysisFailed(out.missing, "Model returned no result for this discussion");
    failed += out.missing.length;
  }

  // Stage B: map new proposals to existing pain points or merge into new canonical ones.
  let newPainPoints = 0;
  if (out.proposals.length) {
    const c = await consolidateProposals(out.proposals, existing, config.topics);
    if (c.usedFallback) warnings.push(`Pain-point grouping fell back to exact-title matching: ${c.error?.slice(0, 160)}`);
    const toCreate = c.groups.filter((g) => !g.existingPainPointId);
    const createdIds = await createPainPoints(
      toCreate.map((g) => ({ title: g.title, description: g.description, topicId: g.topicId, runId })),
    );
    newPainPoints = createdIds.length;
    toCreate.forEach((g, i) => (g.existingPainPointId = createdIds[i]));
    for (const g of c.groups) await assignPainPoint(g.discussionIds, g.existingPainPointId!);
  }
  // Stage B2: merge near-duplicate pain points across runs (only when the set changed).
  let merged = 0;
  if (newPainPoints > 0 && !shouldStop()) {
    try {
      const plans = await proposeMerges(await listMergeCandidates());
      for (const plan of plans) {
        await applyMerge(plan);
        merged += plan.mergedIds.length;
      }
      if (merged) log.info("analyze.merged", { merged, groups: plans.length });
    } catch (err) {
      warnings.push(`Pain-point merge pass skipped: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`);
    }
  }

  const usedPainPoints = [...new Set(out.rows.map((r) => r.pain_point_id).filter((x): x is string => Boolean(x)))];
  await touchPainPoints(usedPainPoints);

  const relevant = out.rows.filter((r) => r.is_relevant).length;
  const remaining = await countAnalysisQueue();
  log.info("analyze.done", {
    analyzed: out.rows.length,
    relevant,
    failed,
    proposals: out.proposals.length,
    newPainPoints,
    merged,
    batches: out.batches,
    pendingAfter: remaining.pending,
  });
  if (remaining.pending > 0) warnings.push(`${remaining.pending} discussion(s) are still waiting for analysis (time or volume limit); the next run continues where this one stopped.`);

  return {
    analyzed: out.rows.length,
    relevant,
    irrelevant: out.rows.length - relevant,
    failed,
    newPainPoints,
    pending: remaining.pending,
    warnings,
  };
}
