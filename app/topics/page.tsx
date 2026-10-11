// /topics page: lists every topic and its search keywords from Supabase.
// It uses the read-only (anon) client, which proves Row Level Security
// allows public reads. Edit topics in the Supabase Table Editor and
// refresh this page to see the change — no code change needed.

import { connection } from "next/server";
import { createBrowserClient, type Topic } from "@/lib/db/supabase";

export default async function TopicsPage() {
  // Tell Next.js to render this page on every request (fresh data),
  // instead of freezing it at build time.
  await connection();

  const supabase = createBrowserClient();
  const { data, error } = await supabase
    .from("topics")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-bold">Topics</h1>
        <p className="mt-4 text-red-600">Could not load topics: {error.message}</p>
      </main>
    );
  }

  const topics = (data ?? []) as Topic[];

  return (
    <main className="mx-auto w-full max-w-3xl p-8">
      <h1 className="text-2xl font-bold">Monitored topics</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {topics.length} topics · keywords are used as search queries on each data source
      </p>

      <ul className="mt-6 space-y-4">
        {topics.map((topic) => (
          <li key={topic.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-semibold">{topic.name}</h2>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  topic.is_active
                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {topic.is_active ? "Active" : "Paused"}
              </span>
            </div>
            {topic.description && (
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{topic.description}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {topic.keywords.map((keyword) => (
                <span
                  key={keyword}
                  className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  {keyword}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
