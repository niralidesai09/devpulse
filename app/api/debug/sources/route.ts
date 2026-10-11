// GET /api/debug/sources
// Test endpoint for Step 3: fetches live posts from all sources and
// returns a summary. Nothing is saved and Gemini is NOT called.
//
// Protected: works freely in local development (npm run dev); in
// production it needs the header  Authorization: Bearer <CRON_SECRET>.

import { hasCronSecret } from "@/lib/auth";
import { getActiveTopics } from "@/lib/db/topics";
import { collectAll } from "@/lib/sources";

// Fetching ~60 API requests can take a while; allow up to 60 seconds.
export const maxDuration = 60;

export async function GET(request: Request) {
  const isDev = process.env.NODE_ENV === "development";
  if (!isDev && !hasCronSecret(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const topics = await getActiveTopics();
    const result = await collectAll(topics);

    // How many posts landed in each topic (shown by topic name).
    const countPerTopic: Record<string, number> = {};
    for (const topic of topics) countPerTopic[topic.name] = 0;
    const nameById = new Map(topics.map((t) => [t.id, t.name]));
    for (const post of result.posts) {
      const name = nameById.get(post.topicId) ?? "unknown";
      countPerTopic[name] = (countPerTopic[name] ?? 0) + 1;
    }

    // How many posts from each source survived dedupe + the 300 cap.
    const keptPerSource: Record<string, number> = {};
    for (const post of result.posts) keptPerSource[post.source] = (keptPerSource[post.source] ?? 0) + 1;

    // Which keywords bring in the most posts (useful for tuning topics).
    const countPerKeyword: Record<string, number> = {};
    for (const post of result.posts) {
      countPerKeyword[post.matchedKeyword] = (countPerKeyword[post.matchedKeyword] ?? 0) + 1;
    }

    // 3 example posts per source.
    const samples: Record<string, unknown[]> = {};
    for (const name of Object.keys(result.sources)) {
      samples[name] = result.posts.filter((p) => p.source === name).slice(0, 3);
    }

    return Response.json({
      window: { start: result.windowStart, end: result.windowEnd },
      topicsLoaded: topics.length,
      sources: result.sources,
      totalPosts: result.posts.length,
      keptPerSource,
      countPerTopic,
      countPerKeyword,
      samples,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
