// /runs: history of every weekly run, with per-source status, so Sumit
// can see what worked, what failed and why.

import { connection } from "next/server";
import { getRuns, type RunRow } from "@/lib/db/dashboard";
import { fmtDateTime, fmtDuration, SOURCE_LABEL } from "@/lib/format";

const STATUS_STYLE: Record<RunRow["status"], string> = {
  success: "text-good",
  partial: "text-warn",
  failed: "text-bad",
  running: "text-accent",
};

export default async function RunsPage() {
  await connection();
  const runs = await getRuns();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Run history</h1>
      <p className="mt-1 text-sm text-ink-3">
        Scheduled every Friday 8:00 AM IST, plus manual runs. If a source fails, the run continues and is marked partial.
      </p>

      {runs.length === 0 && <p className="mt-6 text-sm text-ink-3">No runs yet.</p>}

      <ul className="mt-6 space-y-3">
        {runs.map((run) => (
          <RunItem key={run.id} run={run} />
        ))}
      </ul>
    </main>
  );
}

function RunItem({ run }: { run: RunRow }) {
  const s = run.stats;
  const issues = [
    ...((s.classifyErrors as string[]) ?? []),
    ...((s.baselineErrors as string[]) ?? []),
    s.briefError ? `Brief: ${s.briefError}` : null,
    s.emailError ? `Email: ${s.emailError}` : null,
    run.error,
  ].filter(Boolean) as string[];

  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-medium">
          {fmtDateTime(run.startedAt)}
          <span className="ml-2 text-xs font-normal text-ink-3">{run.trigger === "cron" ? "scheduled" : "manual"}</span>
        </p>
        <p className="text-sm">
          <span className={`font-medium ${STATUS_STYLE[run.status]}`}>{run.status}</span>
          <span className="text-ink-3"> · {fmtDuration(run.startedAt, run.finishedAt)}</span>
        </p>
      </div>

      <dl className="tabular mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <Fact label="Collected" value={s.postsCollected} />
        <Fact label="Relevant" value={s.postsKept} />
        <Fact label="Brief" value={s.briefId ? "written" : s.briefError ? "failed" : "–"} />
        <Fact label="Email" value={s.emailSent ? "sent" : s.emailError ? "failed" : "–"} />
      </dl>

      {Object.keys(run.sources).length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Sources">
          {Object.entries(run.sources).map(([name, src]) => (
            <li
              key={name}
              title={src.error ?? undefined}
              className={`tabular rounded-md border px-2 py-0.5 text-xs ${src.ok ? "border-line text-ink-2" : "border-bad text-bad"}`}
            >
              {src.ok ? "✓" : "✕"} {SOURCE_LABEL[name] ?? name} · {src.count}
            </li>
          ))}
        </ul>
      )}

      {issues.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-warn">{issues.length} issue{issues.length > 1 ? "s" : ""}</summary>
          <ul className="mt-2 space-y-1 text-ink-2">
            {issues.map((issue, i) => (
              <li key={i} className="break-words">
                {issue}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

function Fact({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-ink-3">{label}</dt>
      <dd className="font-medium">{value === undefined || value === null ? "–" : String(value)}</dd>
    </div>
  );
}
