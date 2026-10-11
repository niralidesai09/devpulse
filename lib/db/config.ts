// Monitored topics, keywords and sources — the configuration Sumit edits
// in Settings. The pipeline reads it fresh on every run, so changes apply
// to the next collection without a redeploy.

import type { KeywordRef } from "@/lib/text";
import type { SourceId, TopicInput } from "@/lib/sources/types";
import { check, getDb } from "./client";
import type { KeywordRow, SourceRow, TopicRow } from "./types";

export type TopicWithKeywords = TopicRow & { keywords: KeywordRow[] };

export async function listTopics(opts: { includeArchived?: boolean } = {}): Promise<TopicWithKeywords[]> {
  const db = getDb();
  let q = db.from("topics").select("*, keywords:topic_keywords(*)").order("created_at", { ascending: true });
  if (!opts.includeArchived) q = q.is("archived_at", null);
  const rows = check(await q, "Could not load topics") as TopicWithKeywords[];
  for (const t of rows) t.keywords.sort((a, b) => a.keyword.localeCompare(b.keyword));
  return rows;
}

export async function listSources(): Promise<SourceRow[]> {
  return check(await getDb().from("sources").select("*").order("id"), "Could not load sources") as SourceRow[];
}

export type ActiveConfig = {
  topics: TopicInput[];
  keywords: KeywordRef[];
  sourceIds: SourceId[];
  snapshot: { topics: { id: string; name: string; keywords: string[] }[]; sources: string[] };
};

/** What the next collection will use: active, non-archived topics with their active keywords. */
export async function getActiveConfig(): Promise<ActiveConfig> {
  const [topics, sources] = await Promise.all([listTopics(), listSources()]);
  const active = topics
    .filter((t) => t.is_active && !t.archived_at)
    .map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      keywords: t.keywords.filter((k) => k.is_active).map((k) => k.keyword),
    }))
    .filter((t) => t.keywords.length > 0);
  const keywords = active.flatMap((t) => t.keywords.map((keyword) => ({ keyword, topicId: t.id })));
  const sourceIds = sources.filter((s) => s.is_enabled).map((s) => s.id as SourceId);
  return {
    topics: active,
    keywords,
    sourceIds,
    snapshot: {
      topics: active.map((t) => ({ id: t.id, name: t.name, keywords: t.keywords })),
      sources: sourceIds,
    },
  };
}

// ---------------------------------------------------------------------
// Mutations (called only from admin-protected Server Actions)
// ---------------------------------------------------------------------

/** Postgres unique-violation → friendly message. */
function friendly(error: { code?: string; message: string } | null, duplicateMessage: string): void {
  if (!error) return;
  if (error.code === "23505") throw new UserError(duplicateMessage);
  if (error.code === "23514") throw new UserError("That value is not allowed (check its length).");
  throw new Error(error.message);
}

/** An error whose message is safe and useful to show to the user. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

export async function createTopic(input: { name: string; description: string | null; keywords: string[] }) {
  const db = getDb();
  const { data, error } = await db
    .from("topics")
    .insert({ name: input.name, description: input.description })
    .select("id")
    .single();
  friendly(error, `A topic named "${input.name}" already exists.`);
  if (input.keywords.length) {
    const res = await db.from("topic_keywords").insert(input.keywords.map((keyword) => ({ topic_id: data!.id, keyword })));
    if (res.error) {
      await db.from("topics").delete().eq("id", data!.id); // keep it atomic from the user's view
      friendly(res.error, "One of those keywords is already used by another topic.");
    }
  }
  return data!.id as string;
}

export async function updateTopic(id: string, patch: { name?: string; description?: string | null; is_active?: boolean }) {
  const { error } = await getDb().from("topics").update(patch).eq("id", id);
  friendly(error, `A topic named "${patch.name}" already exists.`);
}

export async function setTopicArchived(id: string, archived: boolean) {
  const { error } = await getDb()
    .from("topics")
    .update({ archived_at: archived ? new Date().toISOString() : null, ...(archived ? { is_active: false } : {}) })
    .eq("id", id);
  friendly(error, "");
}

/**
 * Permanent delete is only allowed when no analysed discussion or pain point
 * references the topic — otherwise history would lose its category. Archive instead.
 */
export async function deleteTopicIfUnused(id: string) {
  const db = getDb();
  const [a, p] = await Promise.all([
    db.from("discussion_analysis").select("discussion_id", { count: "exact", head: true }).eq("topic_id", id),
    db.from("pain_points").select("id", { count: "exact", head: true }).eq("topic_id", id),
  ]);
  if ((a.count ?? 0) > 0 || (p.count ?? 0) > 0) {
    throw new UserError("This topic is referenced by analysed discussions or pain points. Archive it instead to keep history intact.");
  }
  const { error } = await db.from("topics").delete().eq("id", id);
  friendly(error, "");
}

export async function addKeywords(topicId: string, keywords: string[]) {
  const { error } = await getDb()
    .from("topic_keywords")
    .insert(keywords.map((keyword) => ({ topic_id: topicId, keyword })));
  friendly(error, "That keyword is already monitored (keywords must be unique across all topics).");
}

export async function updateKeyword(id: string, patch: { keyword?: string; is_active?: boolean }) {
  const { error } = await getDb().from("topic_keywords").update(patch).eq("id", id);
  friendly(error, "That keyword is already monitored (keywords must be unique across all topics).");
}

export async function deleteKeyword(id: string) {
  const { error } = await getDb().from("topic_keywords").delete().eq("id", id);
  friendly(error, "");
}

export async function setSourceEnabled(id: string, enabled: boolean) {
  const { error } = await getDb().from("sources").update({ is_enabled: enabled }).eq("id", id);
  friendly(error, "");
}
