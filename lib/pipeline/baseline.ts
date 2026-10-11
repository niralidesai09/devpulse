// SMART BASELINE: keyword-match counts for THIS week and LAST week.
//
// Problem: on the very first run there is no "last week" in our database,
// so there is nothing to compare against.
// Solution: ask Hacker News directly how many posts matched each topic's
// keywords in two windows:
//     this week = the run's 7-day window      (days 0-7 ago)
//     last week = the 7 days before that      (days 8-14 ago)
// Both weeks are counted the SAME way (same source, same exact-phrase
// keyword rules), so the % change is a fair comparison from day one.
//
// Why only Hacker News?
//   - HN (Algolia) supports exact-phrase search over any date range and
//     has no tight rate limit.
//   - GitHub: its search "secondary rate limit" (a compute budget) is fully
//     used by the collector's ~11 searches; 22 more searches for the
//     baseline get HTTP 403 every time (tested on 2026-10-11).
//   - DEV.to has no date search (the "ai" tag alone gets 1,000+ posts/day).
//   - Stack Overflow had ~0 matching questions per week.
// We collect post ids per topic, so a post matching 2 keywords counts once.

import type { TopicInput } from "@/lib/sources/types";
import { fetchJson, mapWithLimit, toUnixSeconds } from "@/lib/sources/utils";

export type WeekCounts = { thisWeek: number; lastWeek: number };
export type BaselineSource = "hackernews";

export type TopicBaseline = WeekCounts & {
  bySource: Partial<Record<BaselineSource, WeekCounts>>; // empty = no data (source failed)
};

export type BaselineResult = {
  topics: Record<string, TopicBaseline>; // keyed by topic id
  errors: string[];
  durationMs: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** How many distinct HN stories/comments matched ANY of the topic's keywords. */
async function countHackerNews(topic: TopicInput, start: Date, end: Date): Promise<number> {
  const ids = new Set<string>();
  const { errors } = await mapWithLimit(topic.keywords, 4, async (keyword) => {
    const params = new URLSearchParams({
      query: `"${keyword.replace(/"/g, "")}"`, // quotes = exact phrase...
      advancedSyntax: "true", // ...which needs advancedSyntax on
      tags: "(story,comment)",
      numericFilters: `created_at_i>${toUnixSeconds(start)},created_at_i<=${toUnixSeconds(end)}`,
      hitsPerPage: "1000",
      attributesToRetrieve: "objectID", // we only need the ids
    });
    const data = await fetchJson<{ hits: { objectID: string }[] }>(
      `https://hn.algolia.com/api/v1/search_by_date?${params}`,
    );
    for (const hit of data.hits) ids.add(hit.objectID);
  });
  // A missing keyword would make the count too low -> treat as failed.
  if (errors.length) throw new Error(errors[0]);
  return ids.size;
}

export async function countBaseline(topics: TopicInput[], windowStart: Date, windowEnd: Date): Promise<BaselineResult> {
  const started = Date.now();
  const lastWeekStart = new Date(windowStart.getTime() - 7 * DAY_MS);
  const errors: string[] = [];
  const out: Record<string, TopicBaseline> = {};

  await mapWithLimit(topics, 2, async (topic) => {
    try {
      const [thisWeek, lastWeek] = await Promise.all([
        countHackerNews(topic, windowStart, windowEnd),
        countHackerNews(topic, lastWeekStart, windowStart),
      ]);
      out[topic.id] = { thisWeek, lastWeek, bySource: { hackernews: { thisWeek, lastWeek } } };
    } catch (err) {
      // If either week failed, use NEITHER week: the trend shows "no data"
      // instead of an unfair comparison.
      errors.push(`hackernews / ${topic.name}: ${err instanceof Error ? err.message : String(err)}`);
      out[topic.id] = { thisWeek: 0, lastWeek: 0, bySource: {} };
    }
  });

  return { topics: out, errors, durationMs: Date.now() - started };
}
