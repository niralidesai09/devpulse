// /runs: history of every weekly run, with per-source status, so Sumit
// can see what worked, what failed and why.

import { connection } from "next/server";
import { EmptyState, PageHeader } from "@/components/ui";
import { getRuns, sourceOutcome, type RunRow } from "@/lib/db/dashboard";
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
    <main className="mx-auto max-w-[1200px] px-5 py-6 lg:px-10 lg:py-8">
      <PageHeader
        title="Runs"
        description={
          <p>
            Every collection run: scheduled every Friday at 8:00 AM IST, plus manual runs. If any source fails, even partly, the run continues and is
            marked partial, so a green status always means complete data.
          </p>
        }
      />

      {runs.length === 0 && (
        <div className="mt-6">
          <EmptyState title="No runs yet">The first scheduled run is on Friday at 8:00 AM IST, or start one from the Overview.</EmptyState>
        </div>
      )}

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
  const sourceErrors = Object.entries(run.sources)
    .filter(([, src]) => src.error)
    .map(([name, src]) => `${SOURCE_LABEL[name] ?? name}: ${src.error}`);
  const notes = Object.entries(run.sources).flatMap(([name, src]) => (src.notes ?? []).map((n) => `${SOURCE_LABEL[name] ?? name}: ${n}`));
  // Runs saved before "partial" existed could say success despite a source error.
  const displayStatus: RunRow["status"] = run.status === "success" && sourceErrors.length ? "partial" : run.status;
  const issues = [
    ...sourceErrors,
    ...((s.classifyErrors as string[]) ?? []),
    ...((s.baselineErrors as string[]) ?? []),
    s.briefError ? `Brief: ${s.briefError}` : null,
    s.emailError ? `Email: ${s.emailError}` : null,
    run.error,
  ].filter(Boolean) as string[];

  return (
    <li className="rounded-md border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-medium">
          {fmtDateTime(run.startedAt)}
          <span className="ml-2 text-xs font-normal text-ink-3">{run.trigger === "cron" ? "scheduled" : "manual"}</span>
        </p>
        <p className="text-sm">
          <span className={`font-medium ${STATUS_STYLE[displayStatus]}`}>{displayStatus}</span>
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
          {Object.entries(run.sources).map(([name, src]) => {
            const outcome = sourceOutcome(src);
            const style = outcome === "ok" ? "border-line text-ink-2" : outcome === "partial" ? "border-warn text-warn" : "border-bad text-bad";
            const icon = outcome === "ok" ? "✓" : outcome === "partial" ? "◐" : "✕";
            return (
              <li key={name} title={src.error ?? undefined} className={`tabular rounded-md border px-2 py-0.5 text-xs ${style}`}>
                {icon} {SOURCE_LABEL[name] ?? name} · {src.count}
                {outcome !== "ok" && <span className="sr-only"> ({outcome})</span>}
              </li>
            );
          })}
        </ul>
      )}

      {notes.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-ink-2">
            {notes.length} coverage {notes.length === 1 ? "note" : "notes"} (search limits reached)
          </summary>
          <ul className="mt-2 space-y-1 text-ink-3">
            {notes.map((n, i) => (
              <li key={i} className="break-words">
                {n}
              </li>
            ))}
          </ul>
        </details>
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
