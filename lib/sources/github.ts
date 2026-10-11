// GitHub Issues adapter (REST search API, needs GITHUB_TOKEN).
//
// GitHub search allows only ~30 requests/minute, so instead of one
// request per keyword we combine a topic's keywords with OR:
//   ("flaky tests" OR "flaky test" OR ...) is:issue created:>=2026-10-04
// GitHub also rejects queries with more than 5 OR operators, so a topic
// with 7 keywords is split into 2 queries (6 keywords + 1 keyword).
// Docs: https://docs.github.com/en/rest/search/search#search-issues-and-pull-requests

import {
  cleanText,
  fetchJson,
  mapWithLimit,
  matchTopic,
  runSafely,
  snippetAround,
  type SourceAdapter,
  type SourcePost,
} from "./utils";

type GhIssue = {
  id: number;
  html_url: string;
  title: string;
  body: string | null;
  user: { login: string } | null;
  state: "open" | "closed";
  comments: number;
  reactions?: { total_count: number };
  created_at: string;
};

const MAX_KEYWORDS_PER_QUERY = 6; // 6 keywords = 5 ORs (GitHub's limit)

export const githubAdapter: SourceAdapter = {
  name: "github",

  fetchPosts(topics, since) {
    return runSafely("github", async () => {
      const token = process.env.GITHUB_TOKEN;
      if (!token) throw new Error("GITHUB_TOKEN is not set");

      const sinceDay = since.toISOString().slice(0, 10); // YYYY-MM-DD

      // Build the OR queries: one per topic (two if it has > 6 keywords).
      const jobs = topics.flatMap((topic) => {
        const chunks: string[][] = [];
        for (let i = 0; i < topic.keywords.length; i += MAX_KEYWORDS_PER_QUERY) {
          chunks.push(topic.keywords.slice(i, i + MAX_KEYWORDS_PER_QUERY));
        }
        return chunks.map((keywords) => ({
          topic,
          // Quotes = exact phrase. Remove any quotes inside a keyword.
          query: `(${keywords.map((k) => `"${k.replace(/"/g, "")}"`).join(" OR ")}) is:issue created:>=${sinceDay}`,
        }));
      });

      const { results, errors } = await mapWithLimit(jobs, 2, async ({ topic, query }) => {
        const params = new URLSearchParams({ q: query, sort: "created", order: "desc", per_page: "100" });
        const data = await fetchJson<{ items: GhIssue[] }>(`https://api.github.com/search/issues?${params}`, {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        });

        const posts: SourcePost[] = [];
        for (const issue of data.items) {
          // Skip issues opened by bots (e.g. "dependabot[bot]"): we want human pain points.
          if (issue.user?.login.endsWith("[bot]")) continue;

          const title = cleanText(issue.title, 300);
          const body = cleanText(issue.body, Infinity);
          const match = matchTopic(`${title} ${body}`, topics, topic.id);
          if (!match) continue;
          const snippet = snippetAround(body, match.keyword);

          posts.push({
            source: "github",
            externalId: String(issue.id),
            url: issue.html_url,
            title,
            snippet,
            author: issue.user?.login ?? null,
            score: issue.reactions?.total_count ?? 0,
            commentCount: issue.comments,
            postedAt: issue.created_at,
            matchedKeyword: match.keyword,
            topicId: match.topicId,
            signals: { isOpen: issue.state === "open" },
          });
        }
        return posts;
      });

      return { posts: results.flat(), errors, requests: jobs.length };
    });
  },
};
