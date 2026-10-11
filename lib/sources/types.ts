// Shared types for every data source adapter.
// Each source turns its own API response into the SAME CollectedDiscussion
// shape, so the rest of the app never needs to know where a record came from.

import type { KeywordRef } from "@/lib/text";

export type SourceId = "hackernews" | "github" | "stackoverflow" | "devto";

/** A monitored topic with its active keywords (loaded from Supabase). */
export type TopicInput = {
  id: string;
  name: string;
  description: string | null;
  keywords: string[];
};

/** One normalised discussion from any source. */
export interface CollectedDiscussion {
  sourceId: SourceId;
  externalId: string; // stable id on the source site (primary dedupe key)
  url: string; // link to the original thread
  title: string;
  excerpt: string; // verbatim plain text around the matched keyword
  author: string | null;
  score: number; // points / votes / reactions
  commentCount: number; // comments or answers
  publishedAt: string; // ISO-8601 UTC, original publication time
  matchedKeywords: string[]; // EVERY configured keyword found (counted once regardless)
  topicIds: string[]; // topics those keywords belong to
  // Source facts that help decide whether a problem is unresolved.
  signals: {
    kind?: "story" | "comment" | "question" | "issue" | "article";
    isOpen?: boolean; // GitHub: issue still open
    isAnswered?: boolean; // Stack Overflow: has an upvoted answer
    hasAcceptedAnswer?: boolean; // Stack Overflow: asker accepted an answer
    repo?: string; // GitHub: owner/name
    parentTitle?: string; // HN comment: title of the story it belongs to
  };
}

export type FetchContext = {
  topics: TopicInput[];
  keywords: KeywordRef[];
  since: Date; // publication window start (inclusive)
  until: Date; // publication window end (exclusive)
};

/** What an adapter reports back. Never thrown — failures are data. */
export type SourceFetchResult = {
  discussions: CollectedDiscussion[];
  requests: number;
  failedRequests: number;
  truncated: boolean; // a query returned its page limit, so older matches may be missing
  skippedMalformed: number; // records without id/url/date
  errors: string[];
};

export type SourceOutcome = SourceFetchResult & {
  sourceId: SourceId;
  status: "succeeded" | "partial" | "failed";
  error: string | null;
  durationMs: number;
};

export interface SourceAdapter {
  id: SourceId;
  fetch(ctx: FetchContext): Promise<SourceFetchResult>;
}
