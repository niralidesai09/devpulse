"use client";

// Monitored topics & keywords. Every control calls an admin-protected
// Server Action; results are announced as toasts; destructive actions ask
// for confirmation in an accessible dialog.

import { Archive, ArchiveRestore, Check, Pause, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import {
  addKeywordsAction,
  archiveTopicAction,
  createTopicAction,
  deleteKeywordAction,
  deleteTopicAction,
  renameKeywordAction,
  setSourceEnabledAction,
  setTopicActiveAction,
  toggleKeywordAction,
  updateTopicAction,
  type ActionResult,
} from "@/app/actions";
import { useFeedback } from "./Feedback";
import { Badge, buttonClass, cx, inputClass, labelClass } from "./ui";

export type EditorTopic = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  archived: boolean;
  keywords: { id: string; keyword: string; isActive: boolean }[];
  discussions: number;
  lastCollection: string | null;
};

/** Announce a server-action result as a toast once. */
function useToastResult(result: ActionResult) {
  const { toast } = useFeedback();
  useEffect(() => {
    if (result) toast(result.ok, result.message);
  }, [result, toast]);
}

/** One-shot actions (toggle, delete…) with pending state, optional confirmation and a toast. */
function useAction() {
  const { toast, confirm } = useFeedback();
  const [pending, start] = useTransition();
  const run = async (fn: () => Promise<ActionResult>, ask?: { title: string; body: string; confirmLabel: string; danger?: boolean }) => {
    if (ask && !(await confirm(ask))) return;
    start(async () => {
      const r = await fn();
      if (r) toast(r.ok, r.message);
    });
  };
  return { pending, run };
}

export function NewTopicForm() {
  const [result, action, pending] = useActionState(createTopicAction, null);
  useToastResult(result);
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      <label className={labelClass}>
        Topic name
        <input name="name" required minLength={2} maxLength={80} className={inputClass} placeholder="e.g. Monorepo review workflows" />
      </label>
      <label className={labelClass}>
        <span>
          Description <span className="font-normal text-ink-3">— helps the AI decide what belongs here</span>
        </span>
        <input name="description" maxLength={300} className={inputClass} placeholder="What kind of discussion belongs in this topic?" />
      </label>
      <label className={cx(labelClass, "md:col-span-2")}>
        <span>
          Keywords <span className="font-normal text-ink-3">— phrases developers would actually write, separated by commas</span>
        </span>
        <textarea name="keywords" required rows={2} className={cx(inputClass, "h-auto py-2")} placeholder="monorepo code review, CODEOWNERS bottleneck" />
      </label>
      <div className="md:col-span-2">
        <button type="submit" className={buttonClass("primary", "sm")} disabled={pending}>
          <Plus className="size-4" aria-hidden /> {pending ? "Creating…" : "Create topic"}
        </button>
      </div>
    </form>
  );
}

function KeywordChip({ k, editable }: { k: EditorTopic["keywords"][number]; editable: boolean }) {
  const { pending, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(k.keyword);

  if (editing) {
    return (
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const r = await renameKeywordAction(k.id, value);
            if (r?.ok) setEditing(false);
            return r;
          });
        }}
      >
        <input value={value} onChange={(e) => setValue(e.target.value)} aria-label="Keyword" className={cx(inputClass, "h-8 w-52 text-[13px]")} autoFocus maxLength={80} />
        <button type="submit" className={buttonClass("primary", "sm")} disabled={pending} aria-label="Save keyword">
          <Check className="size-4" aria-hidden />
        </button>
        <button type="button" className={buttonClass("ghost", "sm")} onClick={() => (setEditing(false), setValue(k.keyword))} aria-label="Cancel editing">
          <X className="size-4" aria-hidden />
        </button>
      </form>
    );
  }
  return (
    <span className={cx("group inline-flex h-7 items-center gap-0.5 rounded-full border border-line bg-panel pr-1 pl-3 text-[13px] text-ink", !k.isActive && "text-ink-3")}>
      <span className={cx(!k.isActive && "line-through")}>{k.keyword}</span>
      {editable && (
        <span className="ml-1 inline-flex items-center opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <IconButton label={`Edit keyword ${k.keyword}`} onClick={() => setEditing(true)} disabled={pending}>
            <Pencil className="size-3.5" aria-hidden />
          </IconButton>
          <IconButton label={`${k.isActive ? "Pause" : "Resume"} keyword ${k.keyword}`} onClick={() => run(() => toggleKeywordAction(k.id, !k.isActive))} disabled={pending}>
            {k.isActive ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
          </IconButton>
          <IconButton
            label={`Remove keyword ${k.keyword}`}
            danger
            disabled={pending}
            onClick={() =>
              run(() => deleteKeywordAction(k.id), {
                title: `Remove “${k.keyword}”?`,
                body: "Future collections will stop searching for it. Discussions it already found are kept.",
                confirmLabel: "Remove keyword",
                danger: true,
              })
            }
          >
            <X className="size-3.5" aria-hidden />
          </IconButton>
        </span>
      )}
    </span>
  );
}

function IconButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cx("flex size-6 items-center justify-center rounded-full text-ink-3 transition-colors", danger ? "hover:bg-bad-soft hover:text-bad" : "hover:bg-sunken hover:text-ink")}
    >
      {children}
    </button>
  );
}

export function TopicRow({ topic, editable }: { topic: EditorTopic; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  const [updateResult, updateAction, updating] = useActionState(updateTopicAction, null);
  const [kwResult, kwAction, addingKw] = useActionState(addKeywordsAction, null);
  useToastResult(updateResult);
  useToastResult(kwResult);
  const { pending, run } = useAction();

  return (
    <article className="py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          {editing ? (
            <form action={updateAction} className="grid max-w-xl gap-2" onSubmit={() => setEditing(false)}>
              <input type="hidden" name="id" value={topic.id} />
              <input name="name" defaultValue={topic.name} aria-label="Topic name" required minLength={2} maxLength={80} className={inputClass} />
              <input name="description" defaultValue={topic.description ?? ""} aria-label="Topic description" maxLength={300} className={inputClass} placeholder="Description" />
              <div className="flex gap-2">
                <button type="submit" className={buttonClass("primary", "sm")} disabled={updating}>
                  Save changes
                </button>
                <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[16px] font-semibold text-ink">{topic.name}</h3>
                {topic.archived ? <Badge>Archived</Badge> : topic.isActive ? <Badge tone="ok">Monitoring</Badge> : <Badge tone="up">Paused</Badge>}
              </div>
              {topic.description && <p className="mt-1 max-w-2xl text-[14px] leading-[22px] text-ink-2">{topic.description}</p>}
            </>
          )}
          <p className="mt-1.5 text-[12px] text-ink-3">
            {topic.discussions} discussion{topic.discussions === 1 ? "" : "s"} found so far · last collected {topic.lastCollection ?? "not yet"}
          </p>
        </div>

        {editable && !editing && (
          <div className="flex shrink-0 flex-wrap gap-1.5">
            <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" aria-hidden /> Edit
            </button>
            {!topic.archived && (
              <button type="button" className={buttonClass("secondary", "sm")} disabled={pending} onClick={() => run(() => setTopicActiveAction(topic.id, !topic.isActive))}>
                {topic.isActive ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
                {topic.isActive ? "Pause" : "Resume"}
              </button>
            )}
            <button
              type="button"
              className={buttonClass("secondary", "sm")}
              disabled={pending}
              onClick={() =>
                run(
                  () => archiveTopicAction(topic.id, !topic.archived),
                  topic.archived
                    ? undefined
                    : {
                        title: `Archive “${topic.name}”?`,
                        body: "It stops being monitored. Its discussions and its place in past reports are kept, and you can restore it later.",
                        confirmLabel: "Archive topic",
                      },
                )
              }
            >
              {topic.archived ? <ArchiveRestore className="size-3.5" aria-hidden /> : <Archive className="size-3.5" aria-hidden />}
              {topic.archived ? "Restore" : "Archive"}
            </button>
            {topic.archived && (
              <button
                type="button"
                className={buttonClass("danger", "sm")}
                disabled={pending}
                onClick={() =>
                  run(() => deleteTopicAction(topic.id), {
                    title: `Delete “${topic.name}” permanently?`,
                    body: "This removes the topic and its keywords. It only works if no analysed discussion or pain point uses this topic — otherwise keep it archived.",
                    confirmLabel: "Delete permanently",
                    danger: true,
                  })
                }
              >
                <Trash2 className="size-3.5" aria-hidden /> Delete
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {topic.keywords.length ? topic.keywords.map((k) => <KeywordChip key={k.id} k={k} editable={editable} />) : <span className="text-[13px] text-ink-3">No keywords — add one so this topic can be collected.</span>}
      </div>

      {editable && !topic.archived && (
        <form action={kwAction} className="mt-3 flex max-w-lg gap-2">
          <input type="hidden" name="topicId" value={topic.id} />
          <input name="keywords" aria-label={`Add keywords to ${topic.name}`} placeholder="Add keywords, separated by commas" className={cx(inputClass, "h-8 text-[13px]")} maxLength={400} required />
          <button type="submit" className={buttonClass("secondary", "sm")} disabled={addingKw}>
            <Plus className="size-3.5" aria-hidden /> Add
          </button>
        </form>
      )}
    </article>
  );
}

export function SourceToggle({ id, label, enabled, editable }: { id: string; label: string; enabled: boolean; editable: boolean }) {
  const { pending, run } = useAction();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={`Collect from ${label}`}
      title={editable ? (enabled ? `Stop collecting from ${label}` : `Start collecting from ${label}`) : "Sign in to change"}
      disabled={!editable || pending}
      onClick={() =>
        run(
          () => setSourceEnabledAction(id, !enabled),
          enabled ? { title: `Stop collecting from ${label}?`, body: "The next collection skips this source. Discussions already collected are kept.", confirmLabel: "Disable source" } : undefined,
        )
      }
      className={cx("relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60", enabled ? "bg-accent" : "bg-line-strong")}
    >
      <span className={cx("absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-all", enabled ? "left-[18px]" : "left-0.5")} />
    </button>
  );
}
