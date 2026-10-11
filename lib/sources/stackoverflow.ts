// Stack Overflow adapter (Stack Exchange API v2.3).
//
// Why we don't send one search per keyword:
//   Stack Overflow now gets only a few hundred new questions per week,
//   and the free quota is 300 requests/day per IP. Searching each of
//   ~40 keywords separately returned almost nothing and wasted quota.
//   Instead we page through ALL questions from the last 7 days with
//   /search/advanced (about 3 requests) and match keywords ourselves.
// Docs: https://api.stackexchange.com/docs/advanced-search

import {
  cleanText,
  fetchJson,
  matchTopic,
  runSafely,
  snippetAround,
  toUnixSeconds,
  type SourceAdapter,
  type SourcePost,
} from "./utils";

type SoQuestion = {
  question_id: number;
  title: string;
  body?: string;
  link: string;
  owner?: { display_name?: string };
  score: number;
  answer_count: number;
  is_answered: boolean;
  accepted_answer_id?: number;
  creation_date: number; // unix seconds
};

type SoResponse = {
  items: SoQuestion[];
  has_more: boolean;
  backoff?: number; // seconds the API asks us to wait before the next call
  error_message?: string;
};

const MAX_PAGES = 5; // safety limit: 500 questions

export const stackOverflowAdapter: SourceAdapter = {
  name: "stackoverflow",

  fetchPosts(topics, since) {
    return runSafely("stackoverflow", async () => {
      const posts: SourcePost[] = [];
      const errors: string[] = [];
      let requests = 0;

      // Pages are fetched one after another (concurrency 1) to respect limits.
      for (let page = 1; page <= MAX_PAGES; page++) {
        const params = new URLSearchParams({
          site: "stackoverflow",
          order: "desc",
          sort: "creation",
          fromdate: String(toUnixSeconds(since)),
          pagesize: "100",
          page: String(page),
          filter: "withbody", // include the question body
        });
        // The key is optional: it only raises the daily quota.
        if (process.env.STACKEXCHANGE_KEY) params.set("key", process.env.STACKEXCHANGE_KEY);

        requests++;
        let data: SoResponse;
        try {
          data = await fetchJson<SoResponse>(`https://api.stackexchange.com/2.3/search/advanced?${params}`);
        } catch (err) {
          errors.push(err instanceof Error ? err.message : String(err));
          break; // can't continue paging without this page
        }

        for (const q of data.items) {
          const title = cleanText(q.title, 300);
          const body = cleanText(q.body, Infinity);
          const match = matchTopic(`${title} ${body}`, topics);
          if (!match) continue;
          const snippet = snippetAround(body, match.keyword);

          posts.push({
            source: "stackoverflow",
            externalId: String(q.question_id),
            url: q.link,
            title,
            snippet,
            author: q.owner?.display_name ? cleanText(q.owner.display_name, 100) : null,
            score: q.score,
            commentCount: q.answer_count,
            postedAt: new Date(q.creation_date * 1000).toISOString(),
            matchedKeyword: match.keyword,
            topicId: match.topicId,
            signals: {
              isAnswered: q.is_answered,
              hasAcceptedAnswer: q.accepted_answer_id !== undefined,
            },
          });
        }

        if (!data.has_more) break;
        // Obey the API's "backoff" request, or we get temporarily banned.
        if (data.backoff) await new Promise((r) => setTimeout(r, data.backoff! * 1000));
      }

      return { posts, errors, requests };
    });
  },
};
