// /topics: the categories and keywords DevPulse monitors, stored in Supabase.
// Anyone can view them; adding, editing and pausing needs ADMIN_PASSCODE.
// Changes apply from the next run: no code changes, no redeploy.

import { connection } from "next/server";
import { lockAction, setTopicActiveAction } from "@/app/actions";
import { TopicForm } from "@/components/topic-form";
import { UnlockForm } from "@/components/unlock-form";
import { isAdmin } from "@/lib/admin";
import { createServerClient, type Topic } from "@/lib/db/supabase";

export default async function TopicsPage() {
  await connection();
  const [unlocked, { data, error }] = await Promise.all([
    isAdmin(),
    createServerClient().from("topics").select("*").order("created_at", { ascending: true }),
  ]);
  const topics = (data ?? []) as Topic[];
  const activeCount = topics.filter((t) => t.is_active).length;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Monitored topics</h1>
          <p className="mt-1 text-sm text-ink-3">
            {activeCount} active of {topics.length} · keywords are searched on every source each week
          </p>
        </div>
        {unlocked ? (
          <form action={lockAction}>
            <button type="submit" className="text-xs text-ink-3 hover:text-ink">
              Lock editing
            </button>
          </form>
        ) : (
          <UnlockForm label="Unlock editing" />
        )}
      </div>

      {error && <p className="mt-4 text-sm text-bad">Could not load topics: {error.message}</p>}

      {unlocked && (
        <details className="mt-6 rounded-xl border border-dashed border-line bg-surface p-4">
          <summary className="cursor-pointer text-sm font-medium">+ Add a topic</summary>
          <div className="mt-4">
            <TopicForm submitLabel="Add topic" />
          </div>
        </details>
      )}

      <ul className="mt-6 space-y-3">
        {topics.map((topic) => (
          <li key={topic.id} className={`rounded-xl border border-line bg-surface p-4 ${topic.is_active ? "" : "opacity-70"}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-medium">{topic.name}</h2>
                {topic.description && <p className="mt-0.5 text-sm text-ink-2">{topic.description}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs ${topic.is_active ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-3"}`}>
                  {topic.is_active ? "Active" : "Paused"}
                </span>
                {unlocked && (
                  <form action={setTopicActiveAction}>
                    <input type="hidden" name="id" value={topic.id} />
                    <input type="hidden" name="active" value={String(!topic.is_active)} />
                    <button type="submit" className="rounded-md border border-line px-2 py-0.5 text-xs text-ink-2 hover:text-ink">
                      {topic.is_active ? "Pause" : "Resume"}
                    </button>
                  </form>
                )}
              </div>
            </div>
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Keywords">
              {topic.keywords.map((keyword) => (
                <li key={keyword} className="rounded bg-surface-2 px-2 py-0.5 font-mono text-xs text-ink-2">
                  {keyword}
                </li>
              ))}
            </ul>
            {unlocked && (
              <details className="mt-3 border-t border-line pt-3">
                <summary className="cursor-pointer text-xs text-ink-2 hover:text-ink">Edit</summary>
                <div className="mt-3">
                  <TopicForm topic={topic} submitLabel="Save changes" />
                </div>
              </details>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
