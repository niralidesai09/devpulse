// LIVE database tests against the real Supabase project (service-role key).
// All rows created here are tagged and removed afterwards.
import { afterAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { addKeywords, createTopic, deleteTopicIfUnused, getActiveConfig, UserError } from "@/lib/db/config";
import { ingestDiscussions } from "@/lib/db/discussions";
import { DuplicateScheduledRunError, RunInProgressError, startRun, updateRun } from "@/lib/db/runs";
import type { CollectedDiscussion } from "@/lib/sources/types";

const tag = `livetest-${Date.now()}`;
const createdRuns: string[] = [];
const createdTopics: string[] = [];

afterAll(async () => {
  const db = getDb();
  await db.from("discussions").delete().like("external_id", `${tag}%`);
  if (createdRuns.length) await db.from("collection_runs").delete().in("id", createdRuns);
  for (const id of createdTopics) await db.from("topics").delete().eq("id", id);
});

const doc = (n: number, extra: Partial<CollectedDiscussion> = {}): CollectedDiscussion => ({
  sourceId: "hackernews",
  externalId: `${tag}-${n}`,
  url: `https://example.test/${tag}/${n}`,
  title: `Live test discussion ${n} about flaky tests`,
  excerpt: "flaky tests everywhere",
  author: "tester",
  score: 1,
  commentCount: 0,
  publishedAt: new Date(Date.now() - 86_400_000).toISOString(),
  matchedKeywords: ["flaky tests"],
  topicIds: [],
  signals: { kind: "story" },
  ...extra,
});

async function freshRun() {
  const running = await getDb().from("collection_runs").select("id").eq("status", "running");
  if (running.data?.length) throw new Error("A real run is in progress — rerun these tests later.");
  const run = await startRun({ trigger: "manual", idempotencyKey: null, model: null });
  createdRuns.push(run.id);
  return run;
}

describe("live database", () => {
  it("ingest is idempotent: re-running does not inflate counts", async () => {
    const run = await freshRun();
    try {
      const items = [doc(1), doc(2), doc(3)];
      const first = await ingestDiscussions(run.id, items);
      expect(first.hackernews).toEqual({ inserted: 3, duplicates: 0 });
      // A later collection sees the same discussions again (engagement changed, new keyword matched).
      // Within one batch, items are already unique: dedupeDiscussions() runs before ingest.
      const second = await ingestDiscussions(run.id, [doc(1, { score: 50, matchedKeywords: ["flaky test"] }), doc(2), doc(3)]);
      expect(second.hackernews.inserted).toBe(0);
      const { count } = await getDb().from("discussions").select("id", { count: "exact", head: true }).like("external_id", `${tag}%`);
      expect(count).toBe(3);
      // the refresh updated engagement and merged keywords
      const { data } = await getDb().from("discussions").select("score, matched_keywords").eq("external_id", `${tag}-1`).single();
      expect(data!.score).toBe(50);
      expect(data!.matched_keywords.sort()).toEqual(["flaky test", "flaky tests"]);
    } finally {
      await updateRun(run.id, { status: "succeeded", finished_at: new Date().toISOString() });
    }
  });

  it("a known URL under a different id counts as a duplicate, not a new discussion", async () => {
    const run = await freshRun();
    try {
      const r = await ingestDiscussions(run.id, [doc(99, { externalId: `${tag}-other`, url: `https://example.test/${tag}/1/` })]);
      expect(r.hackernews.inserted).toBe(0);
    } finally {
      await updateRun(run.id, { status: "succeeded", finished_at: new Date().toISOString() });
    }
  });

  it("allows only one running run at a time", async () => {
    const run = await freshRun();
    try {
      await expect(startRun({ trigger: "manual", idempotencyKey: null, model: null })).rejects.toBeInstanceOf(RunInProgressError);
    } finally {
      await updateRun(run.id, { status: "failed", finished_at: new Date().toISOString(), error: "live test" });
    }
  });

  it("rejects a duplicate scheduled run for the same week", async () => {
    const key = `cron:${tag}`;
    const a = await startRun({ trigger: "cron", idempotencyKey: key, model: null });
    createdRuns.push(a.id);
    await updateRun(a.id, { status: "succeeded", finished_at: new Date().toISOString() });
    await expect(startRun({ trigger: "cron", idempotencyKey: key, model: null })).rejects.toBeInstanceOf(DuplicateScheduledRunError);
  });

  it("configuration changes are visible to the next run and duplicates are rejected", async () => {
    const id = await createTopic({ name: `Live test topic ${tag}`, description: null, keywords: [`${tag} keyword`] });
    createdTopics.push(id);
    const cfg = await getActiveConfig();
    expect(cfg.topics.find((t) => t.id === id)?.keywords).toEqual([`${tag} keyword`]);
    await expect(addKeywords(id, [`${tag.toUpperCase()}  KEYWORD`])).rejects.toBeInstanceOf(UserError); // case/space-insensitive unique
    await expect(createTopic({ name: `live test topic ${tag}`, description: null, keywords: ["x y"] })).rejects.toBeInstanceOf(UserError);
    await deleteTopicIfUnused(id);
    createdTopics.pop();
    expect((await getActiveConfig()).topics.find((t) => t.id === id)).toBeUndefined();
  });
});
