// GitHub Issues adapter — REST search API (needs GITHUB_TOKEN, no scopes).
// Docs: https://docs.github.com/en/rest/search/search#search-issues-and-pull-requests
//
// Search is limited to 30 requests/minute and GitHub also enforces an
// undocumented "secondary" burst limit, so this adapter:
//   * combines a topic's keywords with OR (max 5 ORs per query → 6 keywords),
//   * searches ISSUE TITLES only (body matches were mostly unrelated
//     project tickets — measured during Step 3/4 tuning),
//   * sends requests one at a time, 3 s apart,
//   * stops immediately (status "partial") on a 403/429 instead of hammering.

import { cleanText, excerptAround, matchKeywords } from "@/lib/text";
import type { CollectedDiscussion, SourceAdapter } from "./types";
import { emptyResult, fetchJson, HttpError } from "./utils";

const MAX_KEYWORDS_PER_QUERY = 6;
const GAP_MS = 3000;
const MAX_PAGES = 2; // 200 issues per query at most
const EXCLUDE_BOTS = "-author:app/github-actions -author:app/dependabot -author:app/renovate -author:app/coderabbitai";

type GhIssue = {
  id: number;
  html_url: string;
  title: string;
  body: string | null;
  user: { login: string; type?: string } | null;
  state: "open" | "closed";
  comments: number;
  reactions?: { total_count: number };
  created_at: string;
  repository_url: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function buildGithubQueries(
  topics: { keywords: string[] }[],
  since: Date,
  until: Date,
): string[] {
  const range = `${since.toISOString().slice(0, 19)}Z..${new Date(until.getTime() - 1000).toISOString().slice(0, 19)}Z`;
  const queries: string[] = [];
  for (const topic of topics) {
    for (let i = 0; i < topic.keywords.length; i += MAX_KEYWORDS_PER_QUERY) {
      const terms = topic.keywords
        .slice(i, i + MAX_KEYWORDS_PER_QUERY)
        .map((k) => `"${k.replace(/"/g, "")}"`)
        .join(" OR ");
      queries.push(`(${terms}) in:title is:issue created:${range} ${EXCLUDE_BOTS}`);
    }
  }
  return queries;
}

export const githubAdapter: SourceAdapter = {
  id: "github",

  async fetch({ topics, keywords, since, until }) {
    const result = emptyResult();
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      result.requests = 1;
      result.failedRequests = 1;
      result.errors.push("GITHUB_TOKEN is not set");
      return result;
    }

    const byId = new Map<string, CollectedDiscussion>();
    const queries = buildGithubQueries(topics, since, until);
    let blocked = false;

    for (const [qi, q] of queries.entries()) {
      for (let page = 1; page <= MAX_PAGES && !blocked; page++) {
        if (qi > 0 || page > 1) await sleep(GAP_MS);
        result.requests++;
        let data: { total_count: number; items: GhIssue[] };
        try {
          const params = new URLSearchParams({ q, sort: "created", order: "desc", per_page: "100", page: String(page) });
          data = await fetchJson(`https://api.github.com/search/issues?${params}`, {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          });
        } catch (err) {
          result.failedRequests++;
          result.errors.push(err instanceof Error ? err.message : String(err));
          // Rate-limited: stop this source for this run (remaining queries count as failed).
          if (err instanceof HttpError && (err.status === 403 || err.status === 429)) blocked = true;
          break;
        }

        for (const issue of data.items) {
          if (issue.user?.login.endsWith("[bot]") || issue.user?.type === "Bot") continue;
          if (!issue.id || !issue.html_url || !issue.created_at) {
            result.skippedMalformed++;
            continue;
          }
          const title = cleanText(issue.title, 300);
          const body = cleanText(issue.body, Infinity);
          const matches = matchKeywords(title, keywords); // title-only, consistent with the query
          if (!matches.length) continue;
          const key = String(issue.id);
          if (byId.has(key)) continue;
          byId.set(key, {
            sourceId: "github",
            externalId: key,
            url: issue.html_url,
            title,
            excerpt: excerptAround(body, null),
            author: issue.user?.login ?? null,
            score: issue.reactions?.total_count ?? 0,
            commentCount: issue.comments,
            publishedAt: new Date(issue.created_at).toISOString(),
            matchedKeywords: matches.map((m) => m.keyword),
            topicIds: [...new Set(matches.map((m) => m.topicId))],
            signals: {
              kind: "issue",
              isOpen: issue.state === "open",
              repo: issue.repository_url.split("/repos/")[1],
            },
          });
        }

        const fetchedSoFar = page * 100;
        if (data.total_count <= fetchedSoFar) break;
        if (page === MAX_PAGES) result.truncated = true;
      }
      if (blocked) {
        const remaining = queries.length - qi - 1;
        result.requests += remaining;
        result.failedRequests += remaining;
        break;
      }
    }

    result.discussions = [...byId.values()];
    return result;
  },
};
