import type { Metadata } from "next";
import { connection } from "next/server";
import { RunControls } from "@/components/RunControls";
import { NewTopicForm, SourceToggle, TopicCard, type EditorTopic } from "@/components/TopicEditor";
import { Callout, Card, CardBody, CardHeader, ErrorPanel, PageHeader } from "@/components/ui";
import { isAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { listSources, listTopics } from "@/lib/db/config";
import { getRunningRun, listRuns } from "@/lib/db/runs";
import { safeLoad } from "@/lib/db/safe";
import { fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Settings" };

async function load() {
  const [topics, sources, runs, running] = await Promise.all([listTopics({ includeArchived: true }), listSources(), listRuns(40), getRunningRun()]);
  const db = getDb();
  const counts = await Promise.all(
    topics.map((t) => db.from("discussions").select("id", { count: "exact", head: true }).contains("matched_topic_ids", [t.id])),
  );
  const usable = runs.filter((r) => r.status === "succeeded" || r.status === "partial");
  const editorTopics: EditorTopic[] = topics.map((t, i) => {
    const last = usable.find((r) => ((r.config_snapshot as { topics?: { id: string }[] }).topics ?? []).some((x) => x.id === t.id));
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      isActive: t.is_active,
      archived: Boolean(t.archived_at),
      keywords: t.keywords.map((k) => ({ id: k.id, keyword: k.keyword, isActive: k.is_active })),
      discussions: counts[i].count ?? 0,
      lastCollection: last ? fmtDateTime(last.finished_at ?? last.started_at) : null,
    };
  });
  return { topics: editorTopics, sources, running };
}

export default async function SettingsPage() {
  await connection();
  const [admin, loaded] = await Promise.all([isAdmin(), safeLoad(load)]);
  if (!loaded.ok) return <ErrorPanel title="Could not load settings" error={loaded.error} />;
  const { topics, sources, running } = loaded.data;
  const active = topics.filter((t) => !t.archived);
  const archived = topics.filter((t) => t.archived);
  const activeKeywords = active.filter((t) => t.isActive).reduce((n, t) => n + t.keywords.filter((k) => k.isActive).length, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description={
          <>
            Monitored topics, keywords and sources are stored in Supabase and read fresh at the start of every collection — changes apply to
            the next run without a redeploy. {active.filter((t) => t.isActive).length} active topics · {activeKeywords} active keywords.
          </>
        }
        actions={<RunControls isAdmin={admin} runningRunId={running?.id ?? null} showReport={false} compact />}
      />

      {!admin && (
        <Callout tone="info" title="Read-only view">
          Sign in with the admin passcode to create, edit, pause or archive topics and keywords. All changes are checked on the server.
        </Callout>
      )}

      <Card>
        <CardHeader
          title="Topics and keywords"
          description="A discussion is collected when it contains a keyword as an exact phrase (case-insensitive, plurals allowed). Each keyword belongs to one topic; Gemini then decides relevance and the final topic."
        />
        <CardBody className="space-y-3">
          {active.map((t) => (
            <TopicCard key={t.id} topic={t} disabled={!admin} />
          ))}
          {!active.length && <p className="text-sm text-text-2">No topics yet.</p>}
        </CardBody>
      </Card>

      {admin && (
        <Card>
          <CardHeader title="Add a topic" description="Names and keywords must be unique. Keywords are sent to source search APIs as phrases." />
          <CardBody>
            <NewTopicForm disabled={!admin} />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Sources" description="Disabled sources are skipped on the next run. Week-on-week comparisons only use sources collected for both weeks." />
        <ul className="divide-y divide-border">
          {sources.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{s.display_name}</p>
                <p className="text-xs text-text-3">
                  {s.notes}
                  {s.docs_url && (
                    <>
                      {" · "}
                      <a href={s.docs_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        API docs ↗
                      </a>
                    </>
                  )}
                </p>
              </div>
              <SourceToggle id={s.id} label={s.display_name} enabled={s.is_enabled} disabled={!admin} />
            </li>
          ))}
        </ul>
      </Card>

      {archived.length > 0 && (
        <Card>
          <CardHeader title="Archived topics" description="Not monitored. Kept so historical reports stay intact. Delete is only possible when nothing references the topic." />
          <CardBody className="space-y-3">
            {archived.map((t) => (
              <TopicCard key={t.id} topic={t} disabled={!admin} />
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
