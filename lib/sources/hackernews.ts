// Hacker News adapter — Algolia HN Search API (public, no key).
// Docs: https://hn.algolia.com/api
//
// One request per keyword over the whole lookback window, stories AND
// comments. Algolia matches loosely (word-level), so every hit is checked
// locally for the exact keyword phrase before it is kept.

import { cleanText, excerptAround, matchKeywords } from "@/lib/text";
import type { CollectedDiscussion, SourceAdapter } from "./types";
import { emptyResult, fetchJson, mapWithLimit, toUnixSeconds } from "./utils";

// Algolia's maximum. Broad keywords over 3+ weeks can exceed 300, which would
// silently under-count the oldest week; truncation is still flagged if hit.
const HITS_PER_PAGE = 1000;

type HnHit = {
  objectID: string;
  title: string | null; // stories
  story_title: string | null; // comments: parent story title
  story_text: string | null; // Ask HN body
  comment_text: string | null; // comments
  author: string | null;
  points: number | null;
  num_comments: number | null;
  created_at: string;
  _tags: string[];
};

export const hackerNewsAdapter: SourceAdapter = {
  id: "hackernews",

  async fetch({ keywords, since, until }) {
    const result = emptyResult();
    const byId = new Map<string, CollectedDiscussion>();

    const { errors } = await mapWithLimit(keywords, 4, async ({ keyword }) => {
      result.requests++;
      const params = new URLSearchParams({
        query: keyword,
        tags: "(story,comment)",
        numericFilters: `created_at_i>=${toUnixSeconds(since)},created_at_i<${toUnixSeconds(until)}`,
        hitsPerPage: String(HITS_PER_PAGE),
      });
      const data = await fetchJson<{ hits: HnHit[]; nbHits: number }>(
        `https://hn.algolia.com/api/v1/search_by_date?${params}`,
      );
      if (data.nbHits > data.hits.length) result.truncated = true;

      for (const hit of data.hits) {
        if (!hit.objectID || !hit.created_at) {
          result.skippedMalformed++;
          continue;
        }
        const isComment = hit._tags.includes("comment");
        const title = cleanText(isComment ? `Comment on: ${hit.story_title ?? "HN thread"}` : hit.title, 300);
        const body = cleanText(isComment ? hit.comment_text : hit.story_text, Infinity);
        if (!title && !body) {
          result.skippedMalformed++;
          continue;
        }
        // The parent story title is context, not the commenter's words, so
        // comments must contain the keyword in their own text.
        const matchText = isComment ? body : `${title} ${body}`;
        const matches = matchKeywords(matchText, keywords);
        if (!matches.length) continue;

        const existing = byId.get(hit.objectID);
        if (existing) continue; // already captured via another keyword (matches computed over ALL keywords)

        byId.set(hit.objectID, {
          sourceId: "hackernews",
          externalId: hit.objectID,
          url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
          title,
          excerpt: excerptAround(body, matches[0].keyword),
          author: hit.author ?? null,
          score: hit.points ?? 0,
          commentCount: hit.num_comments ?? 0,
          publishedAt: new Date(hit.created_at).toISOString(),
          matchedKeywords: matches.map((m) => m.keyword),
          topicIds: [...new Set(matches.map((m) => m.topicId))],
          signals: { kind: isComment ? "comment" : "story", parentTitle: hit.story_title ?? undefined },
        });
      }
    });

    result.failedRequests = errors.length;
    result.errors = errors;
    result.discussions = [...byId.values()];
    return result;
  },
};
