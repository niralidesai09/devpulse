// Hacker News adapter (Algolia search API, no key needed).
// Exact-phrase search per keyword (stories AND comments, last 7 days),
// up to MAX_PAGES pages of 100. If a keyword has even more matches, we keep
// the newest ones and record a coverage note (never a silent cut-off).
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

const MAX_PAGES = 5; // up to 500 matches per keyword per week

export const hackerNewsAdapter: SourceAdapter = {
  name: "hackernews",

  fetchPosts(topics, since) {
    return runSafely("hackernews", async () => {
      // Build one job per (topic, keyword) pair.
      const jobs = topics.flatMap((topic) => topic.keywords.map((keyword) => ({ topic, keyword })));

      const notes: string[] = [];
      let requests = 0;

      const { results, errors } = await mapWithLimit(jobs, 4, async ({ topic, keyword }) => {
        const posts: SourcePost[] = [];
        for (let page = 0; page < MAX_PAGES; page++) {
          const params = new URLSearchParams({
            query: `"${keyword.replace(/"/g, "")}"`, // quotes = exact phrase...
            advancedSyntax: "true", // ...which needs advancedSyntax on
            tags: "(story,comment)", // stories OR comments
            numericFilters: `created_at_i>${toUnixSeconds(since)}`,
            hitsPerPage: "100",
            page: String(page),
          });
          requests++;
          const data = await fetchJson<{ hits: HnHit[]; nbPages: number; nbHits: number }>(
            `https://hn.algolia.com/api/v1/search_by_date?${params}`,
          );
          const retrievedAt = new Date().toISOString();

          for (const hit of data.hits) {
            const isComment = hit._tags.includes("comment");
            const title = isComment ? `Comment on: ${hit.story_title ?? "HN thread"}` : (hit.title ?? "");
            const body = cleanText(isComment ? hit.comment_text : hit.story_text, Infinity);

            // Keep it only if a keyword really appears in the title or text.
            const match = matchTopic(`${title} ${body}`, topics, topic.id);
            if (!match) continue;
            const snippet = snippetAround(body, match.keyword);

            posts.push({
              source: "hackernews",
              externalId: hit.objectID,
              // Canonical link to the HN discussion itself, built from its id.
              url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
              title,
              snippet,
              author: hit.author ?? null,
              score: hit.points ?? 0,
              commentCount: hit.num_comments ?? 0,
              postedAt: hit.created_at,
              retrievedAt,
              matchedKeyword: match.keyword,
              topicId: match.topicId,
              signals: {},
            });
          }

          if (page + 1 >= data.nbPages) break; // no more pages
          if (page + 1 === MAX_PAGES) {
            notes.push(`"${keyword}": ${data.nbHits} matches, kept the newest ${MAX_PAGES * 100}`);
          }
        }
        return posts;
      });

      // A failed keyword counts as one failed request (its pages stop there).
      return { posts: results.flat(), errors, requests: Math.max(requests, errors.length), notes };
    });
  },
};
