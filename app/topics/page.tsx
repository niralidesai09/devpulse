// Monitored Topics: what Developer Pulse watches. Stored in Supabase and read
// fresh by every collection, so changes apply to the next run without a redeploy.

import type { Metadata } from "next";
import { connection } from "next/server";
import { RunControls } from "@/components/RunControls";
import { NewTopicForm, TopicRow, type EditorTopic } from "@/components/TopicEditor";
import { ButtonLink, Callout, ErrorPanel, PageHeader, Panel, Section } from "@/components/ui";
import { isAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { listTopics } from "@/lib/db/config";
import { getRunningRun, listRuns } from "@/lib/db/runs";
import { safeLoad } from "@/lib/db/safe";
import { fmtRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Monitored Topics" };

async function load() {
  const [topics, runs, running] = await Promise.all([listTopics({ includeArchived: true }), listRuns(40), getRunningRun()]);
  const db = getDb();
  const counts = await Promise.all(topics.map((t) => db.from("discussions").select("id", { count: "exact", head: true }).contains("matched_topic_ids", [t.id])));
  const usable = runs.filter((r) => r.status === "succeeded" || r.status === "partial");
  const rows: EditorTopic[] = topics.map((t, i) => {
    const last = usable.find((r) => ((r.config_snapshot as { topics?: { id: string }[] }).topics ?? []).some((x) => x.id === t.id));
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      isActive: t.is_active,
      archived: Boolean(t.archived_at),
      keywords: t.keywords.map((k) => ({ id: k.id, keyword: k.keyword, isActive: k.is_active })),
      discussions: counts[i].count ?? 0,
      lastCollection: last ? fmtRelative(last.finished_at ?? last.started_at) : null,
    };
  });
  return { rows, running };
}

export default async function TopicsPage() {
  await connection();
  const [admin, loaded] = await Promise.all([isAdmin(), safeLoad(load)]);
  if (!loaded.ok) return <ErrorPanel title="Could not load topics" error={loaded.error} />;
  const { rows, running } = loaded.data;
  const active = rows.filter((t) => !t.archived);
  const archived = rows.filter((t) => t.archived);
  const monitoring = active.filter((t) => t.isActive);
  const keywordCount = monitoring.reduce((n, t) => n + t.keywords.filter((k) => k.isActive).length, 0);

  return (
    <div className="space-y-12">
      <PageHeader
        title="Monitored Topics"
        description="The subjects Developer Pulse watches. Each collection searches every source for these keywords as exact phrases; Gemini then decides which posts are genuinely relevant and which topic they belong to."
        meta={
          <>
            <span>
              {monitoring.length} topics monitored · {keywordCount} keywords
            </span>
            <span>Changes apply to the next collection — no redeploy needed</span>
          </>
        }
        actions={admin ? <RunControls isAdmin={admin} runningRunId={running?.id ?? null} showReport={false} /> : <ButtonLink href="/login?next=/topics" variant="primary" size="sm">Sign in to edit</ButtonLink>}
      />

      {!admin && <Callout title="You are viewing read-only">Sign in with the admin passcode to add, edit, pause or archive topics and keywords. Every change is checked on the server.</Callout>}

      <Section title="Topics" description="Pause a topic to stop collecting it without losing its history. Keywords must be unique across topics.">
        <div className="divide-y divide-line border-y border-line">
          {active.map((t) => (
            <TopicRow key={t.id} topic={t} editable={admin} />
          ))}
        </div>
      </Section>

      {admin && (
        <Section title="Add a topic" description="Give it a clear name, a one-line description and a few precise keywords.">
          <Panel className="p-6">
            <NewTopicForm />
          </Panel>
        </Section>
      )}

      {archived.length > 0 && (
        <Section title="Archived topics" description="Not monitored. Kept so past reports stay intact. A topic can only be deleted when nothing references it.">
          <div className="divide-y divide-line border-y border-line">
            {archived.map((t) => (
              <TopicRow key={t.id} topic={t} editable={admin} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
