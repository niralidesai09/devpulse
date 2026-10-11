// Data health: what ran, what failed, what is stale. Makes the system debuggable and trustworthy.

import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { RunControls } from "@/components/RunControls";
import { Badge, Callout, Card, CardBody, CardHeader, EmptyState, ErrorPanel, PageHeader, SourceBadge, Stat } from "@/components/ui";
import { isGeminiConfigured } from "@/lib/ai/gemini";
import { isAdmin } from "@/lib/auth";
import { listSources } from "@/lib/db/config";
import { countAnalysisQueue } from "@/lib/db/discussions";
import { listRuns } from "@/lib/db/runs";
import { safeLoad } from "@/lib/db/safe";
import { isEmailConfigured } from "@/lib/email/sendBrief";
import { fmtDateTime, fmtDuration, fmtRelative, sourceLabel } from "@/lib/format";

export const metadata: Metadata = { title: "Data health" };

const RUN_TONE = { succeeded: "good", partial: "warn", failed: "bad", running: "info" } as const;
const SRC_TONE = { succeeded: "good", partial: "warn", failed: "bad", skipped: "neutral" } as const;

export default async function HealthPage() {
  await connection();
  const [admin, loaded] = await Promise.all([
    isAdmin(),
    safeLoad(async () => {
      const [runs, sources, queue] = await Promise.all([listRuns(30), listSources(), countAnalysisQueue()]);
      return { runs, sources, queue };
    }),
  ]);
  if (!loaded.ok) return <ErrorPanel title="Could not load data health" error={loaded.error} />;
  const { runs, sources, queue } = loaded.data;
  const running = runs.find((r) => r.status === "running") ?? null;
  const lastBySource = new Map<string, { status: string; at: string; error: string | null }>();
  const lastOkBySource = new Map<string, string>();
  for (const r of runs) {
    for (const s of r.source_runs) {
      if (!lastBySource.has(s.source_id)) lastBySource.set(s.source_id, { status: s.status, at: s.created_at, error: s.error });
      if ((s.status === "succeeded" || s.status === "partial") && !lastOkBySource.has(s.source_id)) lastOkBySource.set(s.source_id, s.created_at);
    }
  }
  const lastCron = runs.find((r) => r.trigger === "cron");
  const failedRuns = runs.filter((r) => r.status === "failed").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data health"
        description="Collection runs, per-source results, analysis backlog and failures. A failed run is never counted as a successful collection."
        actions={<RunControls isAdmin={admin} runningRunId={running?.id ?? null} showRetry showReport={false} compact />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Last run" value={runs[0] ? <Badge tone={RUN_TONE[runs[0].status]}>{runs[0].status}</Badge> : "—"} sub={runs[0] ? `${fmtRelative(runs[0].started_at)} · ${runs[0].trigger}` : "no runs yet"} />
        <Stat label="Last scheduled run" value={lastCron ? <Badge tone={RUN_TONE[lastCron.status]}>{lastCron.status}</Badge> : "none yet"} sub={lastCron ? fmtDateTime(lastCron.started_at) : "Fridays 08:00 IST via Vercel Cron"} hint="Vercel Cron calls /api/cron/weekly every Friday at 02:30 UTC (08:00 IST). On the Hobby plan the call can arrive any time within that hour." />
        <Stat label="Awaiting analysis" value={<span className="tabular">{queue.pending}</span>} sub={`${queue.failed} failed (retried automatically, max 3 attempts)`} />
        <Stat label="Failed runs (last 30)" value={<span className="tabular">{failedRuns}</span>} sub={`AI: ${isGeminiConfigured() ? "configured" : "NOT configured"} · email: ${isEmailConfigured() ? "configured" : "not configured"}`} />
      </div>

      <Card>
        <CardHeader title="Sources" description="Latest result per source. Partial = some requests failed or results were truncated; data from working requests is kept." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-text-3">
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Enabled</th>
                <th className="px-4 py-2 font-medium">Latest result</th>
                <th className="px-4 py-2 font-medium">Last successful collection</th>
                <th className="px-4 py-2 font-medium">Latest error</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => {
                const last = lastBySource.get(s.id);
                return (
                  <tr key={s.id} className="border-b border-border last:border-0 align-top">
                    <td className="px-4 py-2.5">
                      <SourceBadge source={s.id} />
                    </td>
                    <td className="px-4 py-2.5 text-text-2">{s.is_enabled ? "yes" : "no"}</td>
                    <td className="px-4 py-2.5">{last ? <Badge tone={SRC_TONE[last.status as keyof typeof SRC_TONE]}>{last.status}</Badge> : <span className="text-text-3">never run</span>}</td>
                    <td className="px-4 py-2.5 text-text-2">{lastOkBySource.get(s.id) ? fmtDateTime(lastOkBySource.get(s.id)) : "never"}</td>
                    <td className="max-w-[24rem] px-4 py-2.5 text-xs break-words text-text-3">{last?.error ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Run log" description="Most recent first. Expand a run for per-source counts, analysis results and warnings." />
        {runs.length === 0 ? (
          <CardBody>
            <EmptyState title="No runs yet">Start one with “Run collection now”, or wait for the Friday schedule.</EmptyState>
          </CardBody>
        ) : (
          <ul className="divide-y divide-border">
            {runs.map((r) => {
              const st = r.stats ?? {};
              return (
                <li key={r.id}>
                  <details className="group px-4 py-3">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <Badge tone={RUN_TONE[r.status]}>{r.status}</Badge>
                      <span className="font-medium">{fmtDateTime(r.started_at)}</span>
                      <span className="text-xs text-text-3">
                        {r.trigger} · {fmtDuration(st.timingsMs?.total)} · {st.inserted ?? 0} new / {st.alreadyStored ?? 0} already stored · {st.analyzed ?? 0} analysed ({st.relevant ?? 0} relevant)
                      </span>
                      {st.reportId && (
                        <Link href={`/reports/${st.reportId}`} className="text-xs text-accent-text hover:underline">
                          report
                        </Link>
                      )}
                      <span aria-hidden className="ml-auto text-text-3 group-open:rotate-90">›</span>
                    </summary>
                    <div className="mt-3 space-y-3 text-sm">
                      {r.error && <Callout tone="bad" title="Run error">{r.error}</Callout>}
                      <div className="overflow-x-auto">
                        <table className="tabular w-full min-w-[560px] text-left text-xs">
                          <thead>
                            <tr className="text-text-3">
                              <th className="py-1 pr-3 font-medium">Source</th>
                              <th className="py-1 pr-3 font-medium">Status</th>
                              <th className="py-1 pr-3 text-right font-medium">Requests</th>
                              <th className="py-1 pr-3 text-right font-medium">Matched</th>
                              <th className="py-1 pr-3 text-right font-medium">New</th>
                              <th className="py-1 pr-3 text-right font-medium">Duplicates</th>
                              <th className="py-1 pr-3 font-medium">Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.source_runs.map((s) => (
                              <tr key={s.id} className="border-t border-border align-top">
                                <td className="py-1 pr-3">{sourceLabel(s.source_id)}</td>
                                <td className="py-1 pr-3">
                                  <Badge tone={SRC_TONE[s.status]}>{s.status}</Badge>
                                </td>
                                <td className="py-1 pr-3 text-right">
                                  {s.requests - s.failed_requests}/{s.requests}
                                </td>
                                <td className="py-1 pr-3 text-right">{s.fetched_count}</td>
                                <td className="py-1 pr-3 text-right">{s.new_count}</td>
                                <td className="py-1 pr-3 text-right">{s.duplicate_count}</td>
                                <td className="max-w-[22rem] py-1 pr-3 break-words text-text-3">
                                  {[s.truncated && "results truncated at page limit", s.error, fmtDuration(s.duration_ms)].filter(Boolean).join(" · ")}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-text-3">
                        Window {fmtDateTime(r.lookback_start)} → {fmtDateTime(r.lookback_end)} · model {r.model ?? "—"} · pipeline {r.pipeline_version} · stage reached: {st.stage ?? "—"}
                        {st.newPainPoints ? ` · ${st.newPainPoints} new pain point(s)` : ""}
                        {st.pendingAfterRun ? ` · ${st.pendingAfterRun} still pending` : ""}
                        {st.reportStatus ? ` · report ${st.reportStatus}` : ""}
                      </p>
                      {st.reportError && <p className="text-xs text-warn">Report: {st.reportError}</p>}
                      {st.warnings && st.warnings.length > 0 && (
                        <ul className="list-disc space-y-0.5 pl-4 text-xs text-text-2">
                          {st.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
