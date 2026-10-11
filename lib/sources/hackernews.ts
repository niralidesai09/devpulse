// Hacker News adapter (Algolia search API, no key needed).
// One request per keyword; returns both stories AND comments from the last 7 days.
// Docs: https://hn.algolia.com/api

import {
  cleanText,
  fetchJson,
  mapWithLimit,
  matchTopic,
  runSafely,
  snippetAround,
  toUnixSeconds,
  type SourceAdapter,
  type SourcePost,
} from "./utils";

// Only the fields we use from Algolia's response.
type HnHit = {
  objectID: string;
  title: string | null; // stories only
  story_title: string | null; // comments: title of the parent story
  story_text: string | null; // "Ask HN" style story body
  comment_text: string | null; // comments only
  author: string;
  points: number | null;
  num_comments: number | null;
  created_at: string;
  _tags: string[];
};

export const hackerNewsAdapter: SourceAdapter = {
  name: "hackernews",

  fetchPosts(topics, since) {
    return runSafely("hackernews", async () => {
      // Build one job per (topic, keyword) pair.
      const jobs = topics.flatMap((topic) => topic.keywords.map((keyword) => ({ topic, keyword })));

      const { results, errors } = await mapWithLimit(jobs, 4, async ({ topic, keyword }) => {
        const params = new URLSearchParams({
          query: keyword,
          tags: "(story,comment)", // stories OR comments
          numericFilters: `created_at_i>${toUnixSeconds(since)}`,
          hitsPerPage: "100",
        });
        const data = await fetchJson<{ hits: HnHit[] }>(
          `https://hn.algolia.com/api/v1/search_by_date?${params}`,
        );

        const posts: SourcePost[] = [];
        for (const hit of data.hits) {
          const isComment = hit._tags.includes("comment");
          const title = isComment ? `Comment on: ${hit.story_title ?? "HN thread"}` : (hit.title ?? "");
          const body = cleanText(isComment ? hit.comment_text : hit.story_text, Infinity);

          // Keep it only if a keyword really appears (Algolia matches loosely).
          const match = matchTopic(`${title} ${body}`, topics, topic.id);
          if (!match) continue;
          const snippet = snippetAround(body, match.keyword);

          posts.push({
            source: "hackernews",
            externalId: hit.objectID,
            // Link to the HN discussion itself, not the external article.
            url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
            title,
            snippet,
            author: hit.author ?? null,
            score: hit.points ?? 0,
            commentCount: hit.num_comments ?? 0,
            postedAt: hit.created_at,
            matchedKeyword: match.keyword,
            topicId: match.topicId,
            signals: {},
          });
        }
        return posts;
      });

      return { posts: results.flat(), errors, requests: jobs.length };
    });
  },
};
