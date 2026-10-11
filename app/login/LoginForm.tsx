"use client";

import { useActionState } from "react";
import { login } from "@/app/actions";
import { buttonClass, inputClass } from "@/components/ui";

export function LoginForm({ next }: { next: string }) {
  const [result, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="mt-6 grid gap-3">
      <input type="hidden" name="next" value={next} />
      <label className="grid gap-1 text-xs font-medium text-text-2">
        Passcode
        <input name="passcode" type="password" required autoComplete="current-password" className={inputClass} autoFocus />
      </label>
      <button type="submit" className={buttonClass("primary")} disabled={pending}>
        {pending ? "Checking…" : "Sign in"}
      </button>
      {result && !result.ok && (
        <p role="alert" className="text-sm text-bad">
          {result.message}
        </p>
      )}
    </form>
  );
}
