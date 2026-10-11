// collect(): runs the enabled source adapters in parallel and merges their
// results into one de-duplicated list.
//
// Dedupe, in order:
//   1. (sourceId, externalId) — the stable id on the source site
//   2. normalised URL         — catches the same thread reached two ways
// A discussion matched by several keywords is kept ONCE, with all of its
// keywords and topics merged, so it is never counted twice.

import { normalizeUrl } from "@/lib/text";
import { devToAdapter } from "./devto";
import { githubAdapter } from "./github";
import { hackerNewsAdapter } from "./hackernews";
import { stackOverflowAdapter } from "./stackoverflow";
import type { CollectedDiscussion, FetchContext, SourceAdapter, SourceId, SourceOutcome } from "./types";
import { runAdapter } from "./utils";

export const ADAPTERS: Record<SourceId, SourceAdapter> = {
  hackernews: hackerNewsAdapter,
  github: githubAdapter,
  stackoverflow: stackOverflowAdapter,
  devto: devToAdapter,
};

export type CollectOutput = {
  discussions: CollectedDiscussion[];
  outcomes: SourceOutcome[];
  duplicatesWithinRun: number;
};

/** Merge records that point to the same discussion. Pure — unit tested. */
export function dedupeDiscussions(input: CollectedDiscussion[]): { discussions: CollectedDiscussion[]; duplicates: number } {
  const byKey = new Map<string, CollectedDiscussion>();
  const keyByUrl = new Map<string, string>();
  let duplicates = 0;

  for (const d of input) {
    const idKey = `${d.sourceId}:${d.externalId}`;
    const urlKey = normalizeUrl(d.url);
    const existingKey = byKey.has(idKey) ? idKey : keyByUrl.get(urlKey);

    if (existingKey) {
      duplicates++;
      const existing = byKey.get(existingKey)!;
      existing.matchedKeywords = [...new Set([...existing.matchedKeywords, ...d.matchedKeywords])];
      existing.topicIds = [...new Set([...existing.topicIds, ...d.topicIds])];
      existing.score = Math.max(existing.score, d.score);
      existing.commentCount = Math.max(existing.commentCount, d.commentCount);
      continue;
    }
    const copy = { ...d, matchedKeywords: [...d.matchedKeywords], topicIds: [...d.topicIds] };
    byKey.set(idKey, copy);
    keyByUrl.set(urlKey, idKey);
  }
  return { discussions: [...byKey.values()], duplicates };
}

export async function collect(sourceIds: SourceId[], ctx: FetchContext): Promise<CollectOutput> {
  const adapters = sourceIds.map((id) => ADAPTERS[id]).filter(Boolean);
  const outcomes = await Promise.all(adapters.map((a) => runAdapter(a, ctx)));
  const { discussions, duplicates } = dedupeDiscussions(outcomes.flatMap((o) => o.discussions));
  return { discussions, outcomes, duplicatesWithinRun: duplicates };
}

export type { CollectedDiscussion, SourceId, SourceOutcome, TopicInput } from "./types";
