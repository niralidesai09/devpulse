// DEV Community adapter — Forem API v1 (public, no key).
// Docs: https://developers.forem.com/api/v1
//
// DEV has no keyword search, so we read the newest articles from relevant
// tags (paging back until we pass the window start) and match keywords in
// the title + description ourselves.

import { cleanText, matchKeywords } from "@/lib/text";
import type { CollectedDiscussion, SourceAdapter } from "./types";
import { emptyResult, fetchJson, mapWithLimit } from "./utils";

const TAGS = [
  "codereview",
  "cicd",
  "testing",
  "devops",
  "githubactions",
  "github",
  "git",
  "productivity",
  "softwareengineering",
  "ai",
];
const MAX_PAGES_PER_TAG = 3;

type DevArticle = {
  id: number;
  url: string;
  title: string;
  description: string | null;
  user?: { username?: string };
  positive_reactions_count: number;
  comments_count: number;
  published_at: string;
  tag_list?: string[];
};

export const devToAdapter: SourceAdapter = {
  id: "devto",

  async fetch({ keywords, since, until }) {
    const result = emptyResult();
    const byId = new Map<string, CollectedDiscussion>();

    const { errors } = await mapWithLimit(TAGS, 3, async (tag) => {
      for (let page = 1; page <= MAX_PAGES_PER_TAG; page++) {
        result.requests++;
        const articles = await fetchJson<DevArticle[]>(
          `https://dev.to/api/articles/latest?tag=${encodeURIComponent(tag)}&per_page=100&page=${page}`,
        );
        let reachedOlder = articles.length < 100;
        for (const a of articles) {
          const published = new Date(a.published_at);
          if (!a.id || !a.url || Number.isNaN(published.getTime())) {
            result.skippedMalformed++;
            continue;
          }
          if (published < since) {
            reachedOlder = true;
            continue;
          }
          if (published >= until) continue;
          const title = cleanText(a.title, 300);
          const description = cleanText(a.description, 600);
          const matches = matchKeywords(`${title} ${description}`, keywords);
          if (!matches.length || byId.has(String(a.id))) continue;
          byId.set(String(a.id), {
            sourceId: "devto",
            externalId: String(a.id),
            url: a.url,
            title,
            excerpt: description,
            author: a.user?.username ?? null,
            score: a.positive_reactions_count,
            commentCount: a.comments_count,
            publishedAt: published.toISOString(),
            matchedKeywords: matches.map((m) => m.keyword),
            topicIds: [...new Set(matches.map((m) => m.topicId))],
            signals: { kind: "article" },
          });
        }
        if (reachedOlder) return;
        if (page === MAX_PAGES_PER_TAG) result.truncated = true;
      }
    });

    result.failedRequests = errors.length;
    result.errors = errors;
    result.discussions = [...byId.values()];
    return result;
  },
};
