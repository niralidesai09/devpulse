// Shared types for every data source adapter.
// Each source (HN, Stack Overflow, GitHub, DEV.to) turns its own API
// response into the SAME SourcePost shape, so the rest of the app never
// needs to know where a post came from.

export type SourceName = "hackernews" | "stackoverflow" | "github" | "devto";

// The only topic fields an adapter needs (loaded from Supabase).
export type TopicInput = {
  id: string;
  name: string;
  keywords: string[];
};

// One cleaned-up post from any source.
export interface SourcePost {
  source: SourceName;
  externalId: string; // the post's id on its own website
  url: string; // link to the real thread (used as evidence + for dedupe)
  title: string;
  snippet: string; // plain text, HTML removed, max 500 chars, taken around the keyword
  author: string | null;
  score: number; // points / votes / reactions
  commentCount: number; // comments or answers
  postedAt: string; // ISO date string: ORIGINAL publication time from the source
  retrievedAt: string; // ISO date string: when Groundswell fetched it
  matchedKeyword: string; // which topic keyword appears in title/snippet
  topicId: string; // the topic that keyword belongs to
  // Hints that help decide later if a problem is "unresolved".
  signals: {
    isAnswered?: boolean; // Stack Overflow: has any upvoted answer
    hasAcceptedAnswer?: boolean; // Stack Overflow: asker accepted an answer
    isOpen?: boolean; // GitHub: issue still open
  };
}

// What every adapter returns.
//   status "ok"      = every request succeeded
//   status "partial" = some requests failed, but some data came back
//   status "failed"  = nothing usable came back
// A partial or failed source makes the whole run "partial"; the run continues.
// notes = coverage limits that are NOT errors (e.g. a search hit its page cap).
export type SourceStatusValue = "ok" | "partial" | "failed";

export interface SourceResult {
  posts: SourcePost[];
  ok: boolean; // true only when status === "ok"
  status: SourceStatusValue;
  error: string | null;
  notes: string[];
  requests: number;
  failedRequests: number;
  durationMs: number;
}

// The one interface all 4 adapters implement.
export interface SourceAdapter {
  name: SourceName;
  fetchPosts(topics: TopicInput[], since: Date): Promise<SourceResult>;
}
