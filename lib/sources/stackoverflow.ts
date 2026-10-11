// Stack Overflow adapter — Stack Exchange API v2.3 (key optional).
// Docs: https://api.stackexchange.com/docs/advanced-search
//
// Stack Overflow receives only a few hundred new questions per week, and
// the keyless quota is 300 requests/day per IP. One search per keyword
// would burn quota for almost nothing, so we page through ALL questions in
// the window (newest first) and match keywords locally.

import { cleanText, excerptAround, matchKeywords } from "@/lib/text";
import type { SourceAdapter } from "./types";
import { emptyResult, fetchJson, toUnixSeconds } from "./utils";

const MAX_PAGES = 12; // 1 200 questions max

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
  creation_date: number;
};

type SoResponse = {
  items: SoQuestion[];
  has_more: boolean;
  backoff?: number;
  quota_remaining?: number;
};

export const stackOverflowAdapter: SourceAdapter = {
  id: "stackoverflow",

  async fetch({ keywords, since, until }) {
    const result = emptyResult();

    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = new URLSearchParams({
        site: "stackoverflow",
        order: "desc",
        sort: "creation",
        fromdate: String(toUnixSeconds(since)),
        todate: String(toUnixSeconds(until) - 1),
        pagesize: "100",
        page: String(page),
        filter: "withbody",
      });
      if (process.env.STACKEXCHANGE_KEY) params.set("key", process.env.STACKEXCHANGE_KEY);

      result.requests++;
      let data: SoResponse;
      try {
        data = await fetchJson<SoResponse>(`https://api.stackexchange.com/2.3/search/advanced?${params}`);
      } catch (err) {
        result.failedRequests++;
        result.errors.push(err instanceof Error ? err.message : String(err));
        break; // cannot continue paging without this page
      }

      for (const q of data.items) {
        if (!q.question_id || !q.link || !q.creation_date) {
          result.skippedMalformed++;
          continue;
        }
        const title = cleanText(q.title, 300);
        const body = cleanText(q.body, Infinity);
        const matches = matchKeywords(`${title} ${body}`, keywords);
        if (!matches.length) continue;
        result.discussions.push({
          sourceId: "stackoverflow",
          externalId: String(q.question_id),
          url: q.link,
          title,
          excerpt: excerptAround(body, matches[0].keyword),
          author: q.owner?.display_name ? cleanText(q.owner.display_name, 100) : null,
          score: q.score,
          commentCount: q.answer_count,
          publishedAt: new Date(q.creation_date * 1000).toISOString(),
          matchedKeywords: matches.map((m) => m.keyword),
          topicIds: [...new Set(matches.map((m) => m.topicId))],
          signals: {
            kind: "question",
            isAnswered: q.is_answered,
            hasAcceptedAnswer: q.accepted_answer_id !== undefined,
          },
        });
      }

      if (!data.has_more) break;
      if (page === MAX_PAGES) result.truncated = true;
      // The API may ask us to back off; ignoring it gets the IP banned.
      if (data.backoff) await new Promise((r) => setTimeout(r, Math.min(data.backoff!, 30) * 1000));
      if (data.quota_remaining !== undefined && data.quota_remaining < 10) {
        result.truncated = true;
        result.errors.push(`Stack Exchange quota nearly exhausted (${data.quota_remaining} left); stopped paging`);
        break;
      }
    }
    return result;
  },
};
