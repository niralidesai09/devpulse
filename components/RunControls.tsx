"use client";

// "Run collection now" / "Retry" / "Generate report" controls with live
// progress. Starts the run via POST /api/runs (admin cookie checked on the
// server), then polls GET /api/runs/:id until it finishes.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { buttonClass } from "./ui";

const STAGE_LABELS: Record<string, string> = {
  starting: "Starting…",
  collecting: "Collecting from sources…",
  collected: "Stored discussions",
  analysing: "Analysing with Gemini Flash…",
  analysed: "Analysis done",
  analysis_skipped: "Analysis skipped",
  reporting: "Writing the brief…",
  reported: "Brief written",
  report_skipped: "Report skipped",
  done: "Done",
};

type RunState = { id: string; status: string; stage: string | null; error: string | null; reportId: string | null };

export function RunControls({
  isAdmin,
  runningRunId,
  showRetry = false,
  showReport = true,
  compact = false,
}: {
  isAdmin: boolean;
  runningRunId: string | null;
  showRetry?: boolean;
  showReport?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [run, setRun] = useState<RunState | null>(runningRunId ? { id: runningRunId, status: "running", stage: null, error: null, reportId: null } : null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
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
            setMessage({
              ok: data.status !== "failed",
              text:
                data.status === "succeeded"
                  ? "Run finished. The dashboard now shows the new data."
                  : data.status === "partial"
                    ? "Run finished with warnings — see Data health for details."
                    : `Run failed: ${data.error ?? "see Data health"}`,
            });
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
  }, [run, router]);

  async function start(mode: "manual" | "retry") {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, resetFailed: mode === "retry" }),
      });
      const data = await res.json();
      if (res.status === 202) setRun({ id: data.runId, status: "running", stage: "starting", error: null, reportId: null });
      else if (res.status === 409 && data.runId) {
        setMessage({ ok: false, text: data.error });
        setRun({ id: data.runId, status: "running", stage: null, error: null, reportId: null });
      } else setMessage({ ok: false, text: data.error ?? `Request failed (${res.status})` });
    } catch (err) {
      setMessage({ ok: false, text: `Could not reach the server: ${(err as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  async function generateReport() {
    setBusy(true);
    setMessage({ ok: true, text: "Generating the brief from stored data — this takes up to a minute…" });
    try {
      const res = await fetch("/api/reports", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (res.ok) {
        setMessage({ ok: true, text: "Brief generated." });
        router.push(`/reports/${data.reportId}`);
      } else setMessage({ ok: false, text: data.error ?? `Report failed (${res.status})` });
    } catch (err) {
      setMessage({ ok: false, text: `Could not reach the server: ${(err as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  const running = run?.status === "running";

  if (!isAdmin) {
    return (
      <a href="/login?next=/" className={buttonClass("secondary", compact ? "sm" : "md")} title="Sign in with the admin passcode to start a collection">
        Sign in to run
      </a>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        {showReport && (
          <button type="button" className={buttonClass("secondary", compact ? "sm" : "md")} onClick={generateReport} disabled={busy || running}>
            Generate brief
          </button>
        )}
        {showRetry && (
          <button type="button" className={buttonClass("secondary", compact ? "sm" : "md")} onClick={() => start("retry")} disabled={busy || running} title="Collect again and re-queue discussions whose analysis failed">
            Retry failed
          </button>
        )}
        <button type="button" className={buttonClass("primary", compact ? "sm" : "md")} onClick={() => start("manual")} disabled={busy || running}>
          {running ? (
            <>
              <span aria-hidden className="size-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Running…
            </>
          ) : (
            "Run collection now"
          )}
        </button>
      </div>
      <div aria-live="polite" className="min-h-4 text-xs">
        {running && <span className="text-text-2">{STAGE_LABELS[run?.stage ?? "starting"] ?? run?.stage} Usually 1–4 minutes.</span>}
        {!running && message && <span className={message.ok ? "text-good" : "text-bad"}>{message.text}</span>}
      </div>
    </div>
  );
}
