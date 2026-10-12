// collectAll(): runs all 4 source adapters in parallel, merges the results,
// rejects records with an invalid link, removes duplicates and keeps the
// 300 most-engaged posts. Records which sources worked, partly worked or failed.

import { devToAdapter } from "./devto";
import { githubAdapter } from "./github";
import { hackerNewsAdapter } from "./hackernews";
import { stackOverflowAdapter } from "./stackoverflow";
import type { SourceAdapter, SourceName, SourcePost, SourceStatusValue, TopicInput } from "./types";

export const ADAPTERS: SourceAdapter[] = [hackerNewsAdapter, stackOverflowAdapter, githubAdapter, devToAdapter];

const MAX_POSTS = 300;
const WINDOW_DAYS = 7;

// Every record's link must point to its own source site (taken from the
// source API, never generated). Anything else is rejected, not replaced.
const SOURCE_HOSTS: Record<SourceName, string> = {
  hackernews: "news.ycombinator.com",
  github: "github.com",
  stackoverflow: "stackoverflow.com",
  devto: "dev.to",
};

export type SourceStatus = {
  ok: boolean; // true only when status === "ok"
  status: SourceStatusValue; // ok | partial | failed
  count: number; // posts this source contributed BEFORE dedupe + cap
  error: string | null;
  notes: string[]; // coverage limits, e.g. a search that hit its page cap
  requests: number;
  failedRequests: number;
  durationMs: number;
};

export type CollectResult = {
  posts: SourcePost[];
  sources: Record<SourceName, SourceStatus>;
  rejected: { invalidUrl: number; duplicates: number; overCap: number };
  windowStart: string;
  windowEnd: string;
};

// Engagement = how much attention a post got.
const engagement = (p: SourcePost) => p.score + p.commentCount;

/** Make URLs comparable: ignore "#section", trailing "/" and host casing. */
export function normaliseUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return url;
  }
}

/** Is this an https link on the post's own source site? */
export function hasValidSourceUrl(post: Pick<SourcePost, "source" | "url">): boolean {
  try {
    const u = new URL(post.url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return u.protocol === "https:" && host === SOURCE_HOSTS[post.source];
  } catch {
    return false;
  }
}

/**
 * Remove duplicates. Two records are the same discussion if they have the
 * same source + source id, OR the same canonical URL. The copy with the
 * higher engagement is kept, so a post matching several keywords counts once.
 */
export function dedupePosts(posts: SourcePost[]): SourcePost[] {
  const kept: SourcePost[] = [];
  const indexByKey = new Map<string, number>();
  for (const post of posts) {
    const keys = [`${post.source}:${post.externalId}`, normaliseUrl(post.url)];
    const existing = keys.map((k) => indexByKey.get(k)).find((i) => i !== undefined);
    if (existing === undefined) {
      kept.push(post);
      keys.forEach((k) => indexByKey.set(k, kept.length - 1));
    } else if (engagement(post) > engagement(kept[existing])) {
      kept[existing] = post;
      keys.forEach((k) => indexByKey.set(k, existing));
    }
  }
  return kept;
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
      sources[name] = {
        ok: r.ok,
        status: r.status,
        count: r.posts.length,
        error: r.error,
        notes: r.notes,
        requests: r.requests,
        failedRequests: r.failedRequests,
        durationMs: r.durationMs,
      };
      allPosts.push(...r.posts);
    } else {
      sources[name] = {
        ok: false,
        status: "failed",
        count: 0,
        error: String(outcome.reason),
        notes: [],
        requests: 0,
        failedRequests: 0,
        durationMs: 0,
      };
    }
  });

  // 1. Reject records whose link isn't an https URL on their own source site.
  const valid = allPosts.filter(hasValidSourceUrl);
  // 2. One record per discussion.
  const unique = dedupePosts(valid);
  // 3. Keep the 300 posts with the most engagement.
  const posts = [...unique].sort((a, b) => engagement(b) - engagement(a)).slice(0, MAX_POSTS);

  return {
    posts,
    sources,
    rejected: {
      invalidUrl: allPosts.length - valid.length,
      duplicates: valid.length - unique.length,
      overCap: unique.length - posts.length,
    },
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  };
}

export type { SourcePost, SourceName, TopicInput } from "./types";
