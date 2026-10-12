// GET /api/debug/classify
// Test endpoint for Step 4: fetches live posts, sends 10 of them to Gemini
// and shows what Gemini decided. Nothing is saved to the database.
// Optional: ?n=25 to classify more posts (max 50).
//
// Protected exactly like /api/debug/sources: open in local development;
// in production it needs  Authorization: Bearer <CRON_SECRET>.

import { hasCronSecret } from "@/lib/auth";
import { classifyPosts } from "@/lib/ai/classify";
import { getModel } from "@/lib/ai/gemini";
import { getActiveTopics } from "@/lib/db/topics";
import { collectAll, type SourcePost } from "@/lib/sources";

export const maxDuration = 120;

/** Take posts from each source in turn, so the sample isn't all GitHub. */
function mixedSample(posts: SourcePost[], n: number): SourcePost[] {
  const bySource = new Map<string, SourcePost[]>();
  for (const p of posts) bySource.set(p.source, [...(bySource.get(p.source) ?? []), p]);
  const queues = [...bySource.values()];
  const sample: SourcePost[] = [];
  while (sample.length < n && queues.some((q) => q.length)) {
    for (const q of queues) if (q.length && sample.length < n) sample.push(q.shift()!);
  }
  return sample;
}

export async function GET(request: Request) {
  const isDev = process.env.NODE_ENV === "development";
  if (!isDev && !hasCronSecret(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const n = Math.min(Math.max(Number(new URL(request.url).searchParams.get("n")) || 10, 1), 50);
    const topics = await getActiveTopics();
    const collected = await collectAll(topics);
    const sample = mixedSample(collected.posts, n);

    const started = Date.now();
    const result = await classifyPosts(sample, topics);
    const nameById = new Map(topics.map((t) => [t.id, t.name]));

    return Response.json({
      model: getModel(),
      postsCollected: collected.posts.length,
      postsClassified: sample.length,
      kept: result.classified.length,
      dropped: result.dropped.length,
      geminiMs: Date.now() - started,
      batches: result.batches,
      errors: result.errors,
      results: result.classified.map((p) => ({
        source: p.source,
        title: p.title,
        url: p.url,
        keywordTopic: nameById.get(p.topicId),
        topic: p.classification.topicId ? nameById.get(p.classification.topicId) : "(other: not monitored yet)",
        painPoint: p.classification.painPoint,
        isUnresolved: p.classification.isUnresolved,
        unresolvedReason: p.classification.unresolvedReason,
        sentiment: p.classification.sentiment,
        severity: p.classification.severity,
        competitors: p.classification.competitors,
      })),
      droppedPosts: result.dropped.map((d) => ({ source: d.post.source, title: d.post.title, url: d.post.url, why: d.note })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
