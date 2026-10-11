"use client";

import { useActionState } from "react";
import { addDecisionAction } from "@/app/actions";
import { buttonClass, cx, inputClass } from "./ui";

const OPTIONS = [
  { value: "investigate", label: "Investigate" },
  { value: "validate", label: "Validate with users" },
  { value: "backlog", label: "Add to backlog" },
  { value: "monitor", label: "Monitor" },
  { value: "dismiss", label: "Dismiss" },
];

export function DecisionForm({ painPointId, reportId }: { painPointId: string; reportId: string | null }) {
  const [result, action, pending] = useActionState(addDecisionAction, null);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="painPointId" value={painPointId} />
      {reportId && <input type="hidden" name="reportId" value={reportId} />}
      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-text-2">Decision</legend>
        <div className="flex flex-wrap gap-1.5">
          {OPTIONS.map((o) => (
            <label key={o.value} className="cursor-pointer">
              <input type="radio" name="decision" value={o.value} className="peer sr-only" required />
              <span className="inline-flex h-7 items-center rounded-md border border-border-strong px-2.5 text-xs text-text-2 peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent-text peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--focus)]">
                {o.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="grid gap-1 text-xs font-medium text-text-2">
        Rationale <span className="font-normal text-text-3">(optional, visible to the team)</span>
        <textarea name="rationale" maxLength={1000} rows={2} className={cx(inputClass, "h-auto py-1.5")} placeholder="Why? What would change your mind?" />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" className={buttonClass("primary", "sm")} disabled={pending}>
          {pending ? "Saving…" : "Record decision"}
        </button>
        {result && (
          <p role={result.ok ? "status" : "alert"} className={cx("text-xs", result.ok ? "text-good" : "text-bad")}>
            {result.message}
          </p>
        )}
      </div>
    </form>
  );
}
