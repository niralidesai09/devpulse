"use client";

// Topic & keyword management. Each control calls an admin-protected
// Server Action; results are announced inline. Destructive actions confirm first.

import { useActionState, useState, useTransition } from "react";
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
import { Badge, buttonClass, cx, inputClass } from "./ui";

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

function Result({ result }: { result: ActionResult }) {
  if (!result) return null;
  return (
    <p role={result.ok ? "status" : "alert"} className={cx("text-xs", result.ok ? "text-good" : "text-bad")}>
      {result.message}
    </p>
  );
}

/** Run a one-shot action (toggle, delete…) with pending state + inline result. */
function useAction() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult>(null);
  const run = (fn: () => Promise<ActionResult>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    start(async () => setResult(await fn()));
  };
  return { pending, result, run };
}

export function NewTopicForm({ disabled }: { disabled: boolean }) {
  const [result, action, pending] = useActionState(createTopicAction, null);
  return (
    <form action={action} className="grid gap-3 md:grid-cols-[1fr_1fr]">
      <label className="grid gap-1 text-xs font-medium text-text-2">
        Topic name
        <input name="name" required minLength={2} maxLength={80} className={inputClass} placeholder="e.g. Monorepo review workflows" disabled={disabled} />
      </label>
      <label className="grid gap-1 text-xs font-medium text-text-2">
        Description <span className="font-normal text-text-3">(helps the AI classify — optional)</span>
        <input name="description" maxLength={300} className={inputClass} placeholder="What belongs in this topic?" disabled={disabled} />
      </label>
      <label className="grid gap-1 text-xs font-medium text-text-2 md:col-span-2">
        Keywords <span className="font-normal text-text-3">(comma or new-line separated; exact phrases developers would write)</span>
        <textarea
          name="keywords"
          required
          rows={2}
          className={cx(inputClass, "h-auto py-1.5")}
          placeholder="monorepo code review, CODEOWNERS bottleneck"
          disabled={disabled}
        />
      </label>
      <div className="flex items-center gap-3 md:col-span-2">
        <button type="submit" className={buttonClass("primary")} disabled={disabled || pending}>
          {pending ? "Creating…" : "Create topic"}
        </button>
        <Result result={result} />
      </div>
    </form>
  );
}

function KeywordChip({ k, disabled }: { k: EditorTopic["keywords"][number]; disabled: boolean }) {
  const { pending, result, run } = useAction();
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
        <input value={value} onChange={(e) => setValue(e.target.value)} aria-label="Keyword" className={cx(inputClass, "h-7 w-48 text-xs")} autoFocus maxLength={80} />
        <button type="submit" className={buttonClass("primary", "sm")} disabled={pending}>
          Save
        </button>
        <button type="button" className={buttonClass("ghost", "sm")} onClick={() => (setEditing(false), setValue(k.keyword))}>
          Cancel
        </button>
        <Result result={result} />
      </form>
    );
  }
  return (
    <span className={cx("group inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 py-0.5 pl-2 pr-1 text-xs", !k.isActive && "opacity-60")}>
      <span className={cx(!k.isActive && "line-through")}>{k.keyword}</span>
      {!disabled && (
        <span className="inline-flex items-center">
          <button type="button" title="Edit keyword" aria-label={`Edit keyword ${k.keyword}`} className="rounded px-1 text-text-3 hover:bg-surface-3 hover:text-text" onClick={() => setEditing(true)} disabled={pending}>
            ✎
          </button>
          <button
            type="button"
            title={k.isActive ? "Pause keyword" : "Resume keyword"}
            aria-label={`${k.isActive ? "Pause" : "Resume"} keyword ${k.keyword}`}
            className="rounded px-1 text-text-3 hover:bg-surface-3 hover:text-text"
            onClick={() => run(() => toggleKeywordAction(k.id, !k.isActive))}
            disabled={pending}
          >
            {k.isActive ? "⏸" : "▶"}
          </button>
          <button
            type="button"
            title="Remove keyword"
            aria-label={`Remove keyword ${k.keyword}`}
            className="rounded px-1 text-text-3 hover:bg-bad-soft hover:text-bad"
            onClick={() => run(() => deleteKeywordAction(k.id), `Remove the keyword “${k.keyword}”? Discussions it already found are kept.`)}
            disabled={pending}
          >
            ×
          </button>
        </span>
      )}
      {result && !result.ok && <span className="ml-1 text-bad">{result.message}</span>}
    </span>
  );
}

export function TopicCard({ topic, disabled }: { topic: EditorTopic; disabled: boolean }) {
  const [editing, setEditing] = useState(false);
  const [updateResult, updateAction, updating] = useActionState(updateTopicAction, null);
  const [kwResult, kwAction, addingKw] = useActionState(addKeywordsAction, null);
  const { pending, result, run } = useAction();

  return (
    <article className={cx("rounded-lg border border-border bg-surface p-4", topic.archived && "bg-surface-2")}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {editing ? (
            <form action={updateAction} className="grid gap-2 sm:w-[28rem]">
              <input type="hidden" name="id" value={topic.id} />
              <input name="name" defaultValue={topic.name} aria-label="Topic name" required minLength={2} maxLength={80} className={inputClass} />
              <input name="description" defaultValue={topic.description ?? ""} aria-label="Description" maxLength={300} className={inputClass} />
              <div className="flex items-center gap-2">
                <button type="submit" className={buttonClass("primary", "sm")} disabled={updating}>
                  Save
                </button>
                <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setEditing(false)}>
                  Close
                </button>
                <Result result={updateResult} />
              </div>
            </form>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">{topic.name}</h3>
                {topic.archived ? <Badge>Archived</Badge> : topic.isActive ? <Badge tone="good">● Monitoring</Badge> : <Badge tone="warn">⏸ Paused</Badge>}
              </div>
              {topic.description && <p className="mt-0.5 text-xs text-text-2">{topic.description}</p>}
            </>
          )}
          <p className="mt-1 text-xs text-text-3">
            {topic.discussions} stored discussion{topic.discussions === 1 ? "" : "s"} matched · last successful collection: {topic.lastCollection ?? "not yet collected"}
          </p>
        </div>
        {!disabled && !editing && (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setEditing(true)}>
              Edit
            </button>
            {!topic.archived && (
              <button type="button" className={buttonClass("secondary", "sm")} disabled={pending} onClick={() => run(() => setTopicActiveAction(topic.id, !topic.isActive))}>
                {topic.isActive ? "Pause" : "Enable"}
              </button>
            )}
            <button
              type="button"
              className={buttonClass("secondary", "sm")}
              disabled={pending}
              onClick={() =>
                run(
                  () => archiveTopicAction(topic.id, !topic.archived),
                  topic.archived ? undefined : `Archive “${topic.name}”? It stops being monitored; its history stays in past reports.`,
                )
              }
            >
              {topic.archived ? "Restore" : "Archive"}
            </button>
            {topic.archived && (
              <button
                type="button"
                className={buttonClass("danger", "sm")}
                disabled={pending}
                onClick={() => run(() => deleteTopicAction(topic.id), `Permanently delete “${topic.name}” and its keywords? This only works if no analysed data references it.`)}
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {topic.keywords.length ? topic.keywords.map((k) => <KeywordChip key={k.id} k={k} disabled={disabled} />) : <span className="text-xs text-text-3">No keywords — this topic cannot be collected.</span>}
      </div>

      {!disabled && !topic.archived && (
        <form action={kwAction} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input type="hidden" name="topicId" value={topic.id} />
          <input name="keywords" aria-label={`Add keywords to ${topic.name}`} placeholder="Add keywords (comma separated)" className={cx(inputClass, "sm:max-w-sm")} maxLength={400} />
          <button type="submit" className={buttonClass("secondary", "sm")} disabled={addingKw}>
            Add
          </button>
          <Result result={kwResult} />
        </form>
      )}
      <div className="mt-2">
        <Result result={result} />
      </div>
    </article>
  );
}

export function SourceToggle({ id, label, enabled, disabled }: { id: string; label: string; enabled: boolean; disabled: boolean }) {
  const { pending, result, run } = useAction();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${label} source`}
        disabled={disabled || pending}
        onClick={() => run(() => setSourceEnabledAction(id, !enabled))}
        className={cx("relative h-5 w-9 rounded-full border transition-colors disabled:opacity-50", enabled ? "border-accent bg-accent" : "border-border-strong bg-surface-3")}
      >
        <span className={cx("absolute top-0.5 size-3.5 rounded-full bg-white shadow transition-all", enabled ? "left-[18px]" : "left-0.5")} />
      </button>
      <Result result={result} />
    </div>
  );
}
