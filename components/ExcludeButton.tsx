"use client";

import { useState, useTransition } from "react";
import { setExcludedAction, type ActionResult } from "@/app/actions";
import { buttonClass, cx, inputClass } from "./ui";

export function ExcludeButton({ id, excluded }: { id: string; excluded: boolean }) {
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ActionResult>(null);

  if (excluded) {
    return (
      <div className="flex flex-col gap-1">
        <button type="button" className={buttonClass("secondary", "sm")} disabled={pending} onClick={() => start(async () => setResult(await setExcludedAction(id, false, "")))}>
          Include in analysis again
        </button>
        {result && <p className={cx("text-xs", result.ok ? "text-good" : "text-bad")}>{result.message}</p>}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {!open ? (
        <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setOpen(true)}>
          Exclude from analysis
        </button>
      ) : (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => setResult(await setExcludedAction(id, true, reason)));
          }}
        >
          <select aria-label="Reason" className={cx(inputClass, "sm:w-56")} value={reason} onChange={(e) => setReason(e.target.value)} required>
            <option value="">Choose a reason…</option>
            <option value="Irrelevant to our market">Irrelevant to our market</option>
            <option value="Duplicate of another discussion">Duplicate of another discussion</option>
            <option value="Spam or promotional">Spam or promotional</option>
            <option value="Misclassified by AI">Misclassified by AI</option>
          </select>
          <button type="submit" className={buttonClass("danger", "sm")} disabled={pending}>
            Exclude
          </button>
          <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setOpen(false)}>
            Cancel
          </button>
        </form>
      )}
      {result && <p role={result.ok ? "status" : "alert"} className={cx("text-xs", result.ok ? "text-good" : "text-bad")}>{result.message}</p>}
    </div>
  );
}
