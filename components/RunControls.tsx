"use client";

// Collection and brief controls with live progress. Starts the run via
// POST /api/runs (admin session checked on the server), then polls
// GET /api/runs/:id until it finishes. Outcomes are announced as toasts.

import { FileText, Loader2, LogIn, RefreshCw, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useFeedback } from "./Feedback";
import { buttonClass } from "./ui";

const STAGE_LABELS: Record<string, string> = {
  starting: "Starting",
  collecting: "Collecting from sources",
  collected: "Saving discussions",
  analysing: "Analysing with Gemini",
  analysed: "Grouping pain points",
  analysis_skipped: "Analysis skipped",
  reporting: "Writing the brief",
  reported: "Finishing",
  report_skipped: "Finishing",
  done: "Done",
};

type RunState = { id: string; status: string; stage: string | null; error: string | null; reportId: string | null };

export function RunControls({
  isAdmin,
  runningRunId,
  showRetry = false,
  showReport = true,
}: {
  isAdmin: boolean;
  runningRunId: string | null;
  showRetry?: boolean;
  showReport?: boolean;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [run, setRun] = useState<RunState | null>(runningRunId ? { id: runningRunId, status: "running", stage: null, error: null, reportId: null } : null);
  const [busy, setBusy] = useState<null | "run" | "report">(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!run || run.status !== "running") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/runs/${run.id}`, { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as RunState;
          if (cancelled) return;
          setRun(data);
          if (data.status !== "running") {
            if (data.status === "failed") toast(false, `Collection failed: ${data.error ?? "see Sources & Data Health"}`);
            else if (data.status === "partial") toast(true, "Collection finished with warnings. Details are on Sources & Data Health.");
            else toast(true, "Collection finished. The pages now show the new data.");
            router.refresh();
            return;
          }
        }
      } catch {
        /* network blip: keep polling */
      }
      if (!cancelled) timer.current = setTimeout(poll, 3000);
    };
    timer.current = setTimeout(poll, 1500);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [run, router, toast]);

  async function start(mode: "manual" | "retry") {
    setBusy("run");
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, resetFailed: mode === "retry" }),
      });
      const data = await res.json();
      if (res.status === 202) {
        setRun({ id: data.runId, status: "running", stage: "starting", error: null, reportId: null });
        toast(true, "Collection started. It usually takes 1–4 minutes.");
      } else if (res.status === 409 && data.runId) {
        setRun({ id: data.runId, status: "running", stage: null, error: null, reportId: null });
        toast(false, "A collection is already running — showing its progress.");
      } else toast(false, data.error ?? `Could not start (${res.status})`);
    } catch (err) {
      toast(false, `Could not reach the server: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function generateReport() {
    setBusy("report");
    try {
      const res = await fetch("/api/reports", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (res.ok) {
        toast(true, "Weekly brief generated.");
        router.push(`/reports/${data.reportId}`);
      } else toast(false, data.error ?? `Brief generation failed (${res.status})`);
    } catch (err) {
      toast(false, `Could not reach the server: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  if (!isAdmin) {
    return (
      <Link href="/login" className={buttonClass("secondary", "sm")} title="Sign in with the admin passcode to collect new data or generate a brief">
        <LogIn className="size-4" aria-hidden /> Sign in to refresh
      </Link>
    );
  }

  const running = run?.status === "running";
  return (
    <div className="flex flex-col items-start gap-2 md:items-end">
      <div className="flex flex-wrap gap-2">
        {showRetry && (
          <button type="button" className={buttonClass("secondary", "sm")} onClick={() => start("retry")} disabled={!!busy || running} title="Collect again and re-queue discussions whose analysis failed">
            <RotateCcw className="size-4" aria-hidden /> Retry failed
          </button>
        )}
        {showReport && (
          <button type="button" className={buttonClass("secondary", "sm")} onClick={generateReport} disabled={!!busy || running} title="Write a new brief from the data already stored (about 30–60 seconds)">
            {busy === "report" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileText className="size-4" aria-hidden />}
            {busy === "report" ? "Writing brief…" : "Generate brief"}
          </button>
        )}
        <button type="button" className={buttonClass("primary", "sm")} onClick={() => start("manual")} disabled={!!busy || running} title="Collect new discussions from all sources, analyse them and write a new brief">
          {running || busy === "run" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
          {running ? "Collecting…" : "Collect now"}
        </button>
      </div>
      {running && (
        <p aria-live="polite" className="text-[12px] text-ink-3">
          {STAGE_LABELS[run?.stage ?? "starting"] ?? "Working"} · usually 1–4 minutes
        </p>
      )}
    </div>
  );
}
