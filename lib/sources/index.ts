// collectAll(): runs all 4 source adapters in parallel, merges the
// results, removes duplicate URLs and keeps the 300 most-engaged posts.

import { devToAdapter } from "./devto";
import { githubAdapter } from "./github";
import { hackerNewsAdapter } from "./hackernews";
import { stackOverflowAdapter } from "./stackoverflow";
import type { SourceAdapter, SourceName, SourcePost, TopicInput } from "./types";

export const ADAPTERS: SourceAdapter[] = [hackerNewsAdapter, stackOverflowAdapter, githubAdapter, devToAdapter];

const MAX_POSTS = 300;
const WINDOW_DAYS = 7;

export type SourceStatus = {
  ok: boolean;
  count: number; // posts this source contributed BEFORE dedupe + cap
  error: string | null;
  durationMs: number;
};

export type CollectResult = {
  posts: SourcePost[];
  sources: Record<SourceName, SourceStatus>;
  windowStart: string;
  windowEnd: string;
};

// Engagement = how much attention a post got.
const engagement = (p: SourcePost) => p.score + p.commentCount;

// Make URLs comparable: ignore "#section", trailing "/" and host casing.
function normaliseUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return url;
  }
}

export async function collectAll(topics: TopicInput[]): Promise<CollectResult> {
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Run all adapters at the same time. Each one already catches its own
  // errors, but allSettled is a second safety net so nothing can crash here.
  const settled = await Promise.allSettled(ADAPTERS.map((a) => a.fetchPosts(topics, windowStart)));

  const sources = {} as Record<SourceName, SourceStatus>;
  const allPosts: SourcePost[] = [];

  settled.forEach((outcome, i) => {
    const name = ADAPTERS[i].name;
    if (outcome.status === "fulfilled") {
      const r = outcome.value;
      sources[name] = { ok: r.ok, count: r.posts.length, error: r.error, durationMs: r.durationMs };
      allPosts.push(...r.posts);
    } else {
      sources[name] = { ok: false, count: 0, error: String(outcome.reason), durationMs: 0 };
    }
  });

  // Dedupe by URL, keeping the copy with the higher engagement.
  const byUrl = new Map<string, SourcePost>();
  for (const post of allPosts) {
    const key = normaliseUrl(post.url);
    const existing = byUrl.get(key);
    if (!existing || engagement(post) > engagement(existing)) byUrl.set(key, post);
  }

  // Keep the 300 posts with the most engagement.
  const posts = [...byUrl.values()].sort((a, b) => engagement(b) - engagement(a)).slice(0, MAX_POSTS);

  return { posts, sources, windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString() };
}

export type { SourcePost, SourceName, TopicInput } from "./types";
