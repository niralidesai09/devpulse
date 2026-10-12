"use client";

// Exclude a discussion from analysis (or include it again). Persisted; affects metrics and future briefs.

import { EyeOff, Undo2 } from "lucide-react";
import { useState, useTransition } from "react";
import { setExcludedAction } from "@/app/actions";
import { useFeedback } from "./Feedback";
import { buttonClass, cx, inputClass } from "./ui";

const REASONS = ["Irrelevant to our market", "Duplicate of another discussion", "Spam or promotional", "Misclassified by AI"];

export function ExcludeButton({ id, excluded }: { id: string; excluded: boolean }) {
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);

  const act = (exclude: boolean) =>
    start(async () => {
      const r = await setExcludedAction(id, exclude, exclude ? reason : "");
      if (r) toast(r.ok, r.message);
      if (r?.ok) setOpen(false);
    });

  if (excluded) {
    return (
      <button type="button" className={buttonClass("secondary", "sm")} disabled={pending} onClick={() => act(false)}>
        <Undo2 className="size-4" aria-hidden /> Include again
      </button>
    );
  }
  if (!open) {
    return (
      <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setOpen(true)}>
        <EyeOff className="size-4" aria-hidden /> Exclude from analysis
      </button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        act(true);
      }}
    >
      <label className="sr-only" htmlFor={`reason-${id}`}>
        Reason
      </label>
      <select id={`reason-${id}`} className={cx(inputClass, "h-8 w-56 text-[13px]")} value={reason} onChange={(e) => setReason(e.target.value)}>
        {REASONS.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
      <button type="submit" className={buttonClass("danger", "sm")} disabled={pending}>
        Exclude
      </button>
      <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}
