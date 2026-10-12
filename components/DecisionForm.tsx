"use client";

// Record a product decision on a pain point (persisted in pain_point_decisions).

import { useActionState, useEffect } from "react";
import { addDecisionAction } from "@/app/actions";
import { useFeedback } from "./Feedback";
import { buttonClass, cx, inputClass } from "./ui";

const OPTIONS = [
  { value: "investigate", label: "Investigate", hint: "Dig into it now" },
  { value: "validate", label: "Validate", hint: "Ask users first" },
  { value: "backlog", label: "Backlog", hint: "Plan to build" },
  { value: "monitor", label: "Monitor", hint: "Watch for more signal" },
  { value: "dismiss", label: "Dismiss", hint: "Not for us" },
];

export function DecisionForm({ painPointId, reportId, current }: { painPointId: string; reportId: string | null; current?: string | null }) {
  const [result, action, pending] = useActionState(addDecisionAction, null);
  const { toast } = useFeedback();
  useEffect(() => {
    if (result) toast(result.ok, result.ok ? "Decision saved." : result.message);
  }, [result, toast]);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="painPointId" value={painPointId} />
      {reportId && <input type="hidden" name="reportId" value={reportId} />}
      <fieldset>
        <legend className="sr-only">Decision</legend>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
          {OPTIONS.map((o) => (
            <label key={o.value} className="cursor-pointer">
              <input type="radio" name="decision" value={o.value} className="peer sr-only" required defaultChecked={current === o.value} />
              <span className="flex h-full flex-col rounded-[var(--radius)] border border-line-strong bg-panel px-2.5 py-2 text-[13px] font-medium text-ink transition-colors peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent hover:border-ink-3">
                {o.label}
                <span className="text-[11px] font-normal text-ink-3">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="grid gap-1.5 text-[13px] font-medium text-ink-2">
        Why? <span className="sr-only">(optional)</span>
        <textarea name="rationale" maxLength={1000} rows={2} className={cx(inputClass, "h-auto py-2")} placeholder="Optional — your reasoning, and what would change your mind" />
      </label>
      <div>
        <button type="submit" className={buttonClass("primary", "sm")} disabled={pending}>
          {pending ? "Saving…" : "Save decision"}
        </button>
      </div>
    </form>
  );
}
