"use client";
// Add / edit a monitored topic. Saved straight to Supabase by a Server
// Action, so Sumit can change what Groundswell watches without code changes.

import { useActionState } from "react";
import { saveTopicAction } from "@/app/actions";

type TopicValues = { id?: string; name: string; description: string | null; keywords: string[]; is_active: boolean };

const input = "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm placeholder:text-ink-3";

export function TopicForm({ topic, submitLabel }: { topic?: TopicValues; submitLabel: string }) {
  const [state, formAction, pending] = useActionState(saveTopicAction, null);
  const prefix = topic?.id ?? "new";

  return (
    <form action={formAction} className="grid gap-3">
      {topic?.id && <input type="hidden" name="id" value={topic.id} />}
      <div className="grid gap-1">
        <label htmlFor={`${prefix}-name`} className="text-xs font-medium text-ink-2">
          Topic name
        </label>
        <input id={`${prefix}-name`} name="name" required defaultValue={topic?.name} className={input} placeholder="e.g. Monorepo CI slowness" />
      </div>
      <div className="grid gap-1">
        <label htmlFor={`${prefix}-description`} className="text-xs font-medium text-ink-2">
          Description <span className="font-normal text-ink-3">(helps the AI classify posts)</span>
        </label>
        <input id={`${prefix}-description`} name="description" defaultValue={topic?.description ?? ""} className={input} />
      </div>
      <div className="grid gap-1">
        <label htmlFor={`${prefix}-keywords`} className="text-xs font-medium text-ink-2">
          Keywords <span className="font-normal text-ink-3">(one per line; exact phrases developers type)</span>
        </label>
        <textarea
          id={`${prefix}-keywords`}
          name="keywords"
          required
          rows={5}
          defaultValue={topic?.keywords.join("\n")}
          className={`${input} font-mono text-[13px]`}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={topic?.is_active ?? true} className="size-4 accent-[var(--accent)]" />
        Active (monitored in the weekly run)
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-white disabled:opacity-60 dark:text-[#0d1726]">
          {pending ? "Saving…" : submitLabel}
        </button>
        {state && (
          <p role="status" className={`text-xs ${state.ok ? "text-good" : "text-bad"}`}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
