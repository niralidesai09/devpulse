"use client";
// Small passcode form that unlocks admin features (Run now, topic editing).

import { useActionState } from "react";
import { unlockAction } from "@/app/actions";

export function UnlockForm({ label = "Unlock" }: { label?: string }) {
  const [state, formAction, pending] = useActionState(unlockAction, null);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <label htmlFor="passcode" className="sr-only">
        Admin passcode
      </label>
      <input
        id="passcode"
        name="passcode"
        type="password"
        required
        autoComplete="current-password"
        placeholder="Admin passcode"
        className="h-9 w-44 rounded-md border border-line bg-surface px-3 text-sm placeholder:text-ink-3"
      />
      <button
        type="submit"
        disabled={pending}
        className="h-9 rounded-md border border-line bg-surface-2 px-3 text-sm font-medium hover:border-ink-3 disabled:opacity-60"
      >
        {pending ? "Checking…" : label}
      </button>
      {state && !state.ok && (
        <p role="alert" className="w-full text-xs text-bad">
          {state.message}
        </p>
      )}
    </form>
  );
}
