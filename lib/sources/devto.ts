// DEV.to adapter (Forem API, no key needed).
//
// DEV.to has no keyword search, so we fetch the newest articles from
// relevant tags, keep only those from the last 7 days, and match them
// to topics by keyword in the title or description ourselves.
// Docs: https://developers.forem.com/api/v1

import {
  cleanText,
  fetchJson,
  mapWithLimit,
  matchTopic,
  runSafely,
  type SourceAdapter,
  type SourcePost,
} from "./utils";

type DevArticle = {
  id: number;
  url: string;
  title: string;
  description: string | null;
  user?: { username?: string };
  positive_reactions_count: number;
  comments_count: number;
  published_at: string;
};

// Tags where code review / CI/CD / workflow discussions happen.
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

export const devToAdapter: SourceAdapter = {
  name: "devto",

  fetchPosts(topics, since) {
    return runSafely("devto", async () => {
      const { results, errors } = await mapWithLimit(TAGS, 3, async (tag) => {
        // /articles/latest = newest first, up to 1000 per page. Busy tags
        // (e.g. "ai") get 1000+ posts a day, so 100 covered only a few hours.
        const articles = await fetchJson<DevArticle[]>(
          `https://dev.to/api/articles/latest?tag=${encodeURIComponent(tag)}&per_page=1000`,
        );

        const posts: SourcePost[] = [];
        for (const a of articles) {
          if (new Date(a.published_at) < since) continue; // older than 7 days

          const title = cleanText(a.title, 300);
          const snippet = cleanText(a.description);
          const match = matchTopic(`${title} ${snippet}`, topics);
          if (!match) continue;

          posts.push({
            source: "devto",
            externalId: String(a.id),
            url: a.url,
            title,
            snippet,
            author: a.user?.username ?? null,
            score: a.positive_reactions_count,
            commentCount: a.comments_count,
            postedAt: a.published_at,
            matchedKeyword: match.keyword,
            topicId: match.topicId,
            signals: {},
          });
        }
        return posts;
      });

      return { posts: results.flat(), errors, requests: TAGS.length };
    });
  },
};
