"use client";
// "Run now" button: starts the full pipeline on demand (for live demos).
// Locked behind ADMIN_PASSCODE: shows the passcode form until unlocked.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { lockAction } from "@/app/actions";
import { UnlockForm } from "./unlock-form";

type Result = { status?: string; error?: string | null; stats?: Record<string, unknown> };

export function RunNow({ unlocked }: { unlocked: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Count seconds while the run is going, so the wait feels transparent.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);

  async function start() {
    setRunning(true);
    setSeconds(0);
    setMessage(null);
    try {
      const res = await fetch("/api/run", { method: "POST" });
      const data: Result = await res.json();
      if (!res.ok || data.status === "failed") {
        setMessage({ ok: false, text: data.error ?? `Run failed (HTTP ${res.status})` });
      } else {
        const kept = data.stats?.postsKept;
        const emailed = data.stats?.emailSent ? "brief emailed" : "email not sent";
        setMessage({ ok: true, text: `Done: ${data.status} · ${kept} relevant posts · ${emailed}` });
        router.refresh(); // show the new numbers
      }
    } catch {
      setMessage({ ok: false, text: "Network error: the run may still finish. Check the Runs page." });
    } finally {
      setRunning(false);
    }
  }

  if (!unlocked) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-ink-3">Run the pipeline now</span>
        <UnlockForm label="Unlock" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={start}
          disabled={running}
          className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-accent-ink hover:opacity-90 disabled:opacity-70"
        >
          {running ? `Running… ${seconds}s` : "Run now"}
        </button>
        <form action={lockAction}>
          <button type="submit" className="h-9 px-2 text-xs text-ink-3 hover:text-ink">
            Lock
          </button>
        </form>
      </div>
      <p aria-live="polite" className={`text-xs ${message ? (message.ok ? "text-good" : "text-bad") : "text-ink-3"}`}>
        {message?.text ?? (running ? "Collecting, classifying and writing the brief (about 1–2 minutes)" : "Collect → classify → score → brief → email")}
      </p>
    </div>
  );
}
