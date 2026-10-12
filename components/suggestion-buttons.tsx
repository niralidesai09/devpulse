"use client";
// Approve / Reject buttons for one Emerging Topic Radar suggestion.

import { useActionState } from "react";
import { decideSuggestionAction } from "@/app/actions";

export function SuggestionButtons({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(decideSuggestionAction, null);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        name="decision"
        value="approve"
        disabled={pending}
        className="h-8 rounded-md bg-accent px-3 text-xs font-medium text-accent-ink disabled:opacity-60"
      >
        Approve &amp; monitor
      </button>
      <button
        type="submit"
        name="decision"
        value="reject"
        disabled={pending}
        className="h-8 rounded-md border border-line px-3 text-xs text-ink-2 hover:text-ink disabled:opacity-60"
      >
        Reject
      </button>
      {state && (
        <p role="status" className={`w-full text-xs ${state.ok ? "text-good" : "text-bad"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
