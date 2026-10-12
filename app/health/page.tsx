// Sources & Data Health — is collection working, and what to do when it is not.

import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { RunControls } from "@/components/RunControls";
import { SourceToggle } from "@/components/TopicEditor";
import { Badge, Callout, cx, EmptyState, ErrorPanel, Metric, PageHeader, Section, SourceTag, StatusDot } from "@/components/ui";
import { isGeminiConfigured } from "@/lib/ai/gemini";
import { isAdmin } from "@/lib/auth";
import { listSources } from "@/lib/db/config";
import { countAnalysisQueue } from "@/lib/db/discussions";
import { listRuns } from "@/lib/db/runs";
import { safeLoad } from "@/lib/db/safe";
import type { SourceRunRow } from "@/lib/db/types";
import { isEmailConfigured } from "@/lib/email/sendBrief";
import { fmtDateTime, fmtDuration, fmtRelative, sourceLabel } from "@/lib/format";

export const metadata: Metadata = { title: "Sources & Data Health" };

const RUN_TONE = { succeeded: "ok", partial: "up", failed: "bad", running: "accent" } as const;
const RUN_LABEL = { succeeded: "Succeeded", partial: "Finished with warnings", failed: "Failed", running: "Running" } as const;
const RUN_SHORT = { succeeded: "Succeeded", partial: "Partial", failed: "Failed", running: "Running" } as const;

/** Plain-language status and next step for a source's latest result. */
function explain(s: SourceRunRow | undefined, enabled: boolean): { tone: "ok" | "warn" | "bad" | "idle"; status: string; next: string } {
  if (!enabled) return { tone: "idle", status: "Disabled", next: "Turn it on to include it in the next collection." };
  if (!s) return { tone: "idle", status: "Not collected yet", next: "It will be collected on the next run." };
  const err = s.error ?? "";
  if (s.status === "failed") {
    if (/GITHUB_TOKEN/i.test(err)) return { tone: "bad", status: "Not configured", next: "Add a GITHUB_TOKEN environment variable on Vercel, then collect again." };
    if (/rate limit|403|429/i.test(err)) return { tone: "bad", status: "Rate-limited", next: "The source asked us to slow down. Other sources were kept; it retries automatically next run." };
    return { tone: "bad", status: "Failed", next: "Other sources were kept. Try “Collect now” later; if it keeps failing, check the error below." };
  }
  if (s.status === "partial") {
    if (/rate limit|403|429/i.test(err)) return { tone: "warn", status: "Partly collected (rate-limited)", next: "Some searches were refused by the source’s rate limit; what was fetched is kept. No action needed." };
    return { tone: "warn", status: "Partly collected", next: "Some requests failed; what was fetched is kept." };
  }
  if (s.truncated)
    return { tone: "ok", status: "Working · sampled", next: "More matches exist than one request returns, so this source is a sample: used as evidence, left out of week-on-week trends." };
  return { tone: "ok", status: "Working", next: "No action needed." };
}

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
  const lastGood = runs.find((r) => r.status === "succeeded" || r.status === "partial") ?? null;
  const latestBySource = new Map<string, SourceRunRow>();
  const lastOkBySource = new Map<string, string>();
  for (const r of runs)
    for (const s of r.source_runs) {
      if (!latestBySource.has(s.source_id)) latestBySource.set(s.source_id, s);
      if ((s.status === "succeeded" || s.status === "partial") && !lastOkBySource.has(s.source_id)) lastOkBySource.set(s.source_id, s.created_at);
    }
  const lastCron = runs.find((r) => r.trigger === "cron");

  return (
    <div className="space-y-12">
      <PageHeader
        title="Sources & Data Health"
        description="Whether collection is working: which sources answered, what was collected, what failed and what you can do about it."
        meta={
          <>
            <span>Last successful collection {lastGood ? `${fmtRelative(lastGood.finished_at)} · ${fmtDateTime(lastGood.finished_at)}` : "never"}</span>
            <span>Scheduled every Friday 08:00 IST</span>
          </>
        }
        actions={<RunControls isAdmin={admin} runningRunId={running?.id ?? null} showRetry showReport={false} />}
      />

      <section aria-label="Summary" className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-line">
        <Metric
          label="Latest collection"
          value={runs[0] ? RUN_SHORT[runs[0].status] : "None yet"}
          explanation={runs[0] ? `${runs[0].trigger === "cron" ? "Scheduled" : "Manual"} · started ${fmtRelative(runs[0].started_at)}${runs[0].status === "partial" ? " · some sources returned warnings (below)" : ""}` : "Start one with “Collect now”."}
        />
        <div className="lg:pl-8">
          <Metric
            label="Last scheduled run"
            value={lastCron ? RUN_SHORT[lastCron.status] : "Not yet"}
            explanation={lastCron ? fmtDateTime(lastCron.started_at) : "Vercel Cron calls it every Friday between 08:00 and 08:59 IST."}
            tip="Vercel Cron triggers /api/cron/weekly at 02:30 UTC on Fridays (08:00 IST). On the Hobby plan the call can arrive any time within that hour."
          />
        </div>
        <div className="lg:pl-8">
          <Metric
            label="Waiting for analysis"
            value={queue.pending}
            explanation={queue.failed ? `${queue.failed} failed analysis — retried automatically (up to 3 attempts)` : "Discussions collected but not yet analysed by Gemini."}
          />
        </div>
        <div className="lg:pl-8">
          <Metric
            label="Integrations"
            value={isGeminiConfigured() ? "Ready" : "Incomplete"}
            explanation={`Gemini ${isGeminiConfigured() ? "configured" : "not configured"} · email ${isEmailConfigured() ? "configured" : "not configured"}`}
          />
        </div>
      </section>

      <Section title="Sources" description="Each collection asks every enabled source for your keywords. A source failing never stops the others.">
        <ul className="divide-y divide-line border-y border-line">
          {sources.map((s) => {
            const latest = latestBySource.get(s.id);
            const e = explain(latest, s.is_enabled);
            return (
              <li key={s.id} className="grid gap-3 py-5 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] md:items-start md:gap-6">
                <div>
                  <div className="text-[15px] font-medium text-ink">
                    <SourceTag source={s.id} />
                  </div>
                  <p className="mt-1 flex items-center gap-2 text-[13px] text-ink-2">
                    <StatusDot tone={e.tone} /> {e.status}
                  </p>
                </div>
                <div className="min-w-0 text-[13px] leading-5 text-ink-2">
                  <p>
                    Last successful collection: <span className="text-ink">{lastOkBySource.get(s.id) ? fmtRelative(lastOkBySource.get(s.id)) : "never"}</span>
                    {latest && (
                      <>
                        {" · "}last run found <span className="tabular text-ink">{latest.fetched_count}</span> matching ({latest.new_count} new, {latest.duplicate_count} already stored)
                      </>
                    )}
                  </p>
                  <p className="mt-1 text-ink-3">{e.next}</p>
                  {latest?.error && (
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-ink-3 hover:text-ink-2">Technical detail</summary>
                      <p className="mt-1 font-mono text-[12px] break-words text-ink-3">{latest.error}</p>
                    </details>
                  )}
                </div>
                <div className="flex items-center gap-3 md:justify-end">
                  <span className="text-[13px] text-ink-3">{s.is_enabled ? "Collecting" : "Off"}</span>
                  <SourceToggle id={s.id} label={sourceLabel(s.id)} enabled={s.is_enabled} editable={admin} />
                </div>
              </li>
            );
          })}
        </ul>
        {!admin && <p className="mt-3 text-[13px] text-ink-3">Sign in to turn sources on or off.</p>}
      </Section>

      <Section title="Collection history" description="Every run is recorded — scheduled, manual or retry. Open a run for per-source results and warnings.">
        {runs.length === 0 ? (
          <EmptyState title="No collections yet">Start one with “Collect now”, or wait for Friday’s scheduled run.</EmptyState>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {runs.map((r) => {
              const st = r.stats ?? {};
              return (
                <li key={r.id}>
                  <details className="group py-3.5">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 text-[14px] [&::-webkit-details-marker]:hidden">
                      <ChevronRight aria-hidden className="size-4 text-ink-3 transition-transform group-open:rotate-90" />
                      <span className="w-44 font-medium text-ink">{fmtDateTime(r.started_at)}</span>
                      <Badge tone={RUN_TONE[r.status]}>{RUN_LABEL[r.status]}</Badge>
                      <span className="text-[13px] text-ink-3">
                        {r.trigger === "cron" ? "Scheduled" : r.trigger === "retry" ? "Retry" : "Manual"} · {fmtDuration(st.timingsMs?.total)} · {st.inserted ?? 0} new · {st.relevant ?? 0} relevant
                      </span>
                      {st.reportId && (
                        <Link href={`/reports/${st.reportId}`} className="text-[13px] text-accent-ink hover:underline">
                          View brief
                        </Link>
                      )}
                    </summary>
                    <div className="mt-3 space-y-3 pl-8 text-[13px]">
                      {r.error && <Callout tone="bad" title="Why it failed">{r.error}</Callout>}
                      <div className="overflow-x-auto">
                        <table className="tabular w-full min-w-[560px] text-left">
                          <thead>
                            <tr className="text-[12px] text-ink-3">
                              <th className="py-1.5 pr-4 font-medium">Source</th>
                              <th className="py-1.5 pr-4 font-medium">Result</th>
                              <th className="py-1.5 pr-4 text-right font-medium">Matching</th>
                              <th className="py-1.5 pr-4 text-right font-medium">New</th>
                              <th className="py-1.5 pr-4 text-right font-medium">Already stored</th>
                              <th className="py-1.5 font-medium">Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.source_runs.map((s) => (
                              <tr key={s.id} className="border-t border-line text-ink-2">
                                <td className="py-1.5 pr-4">{sourceLabel(s.source_id)}</td>
                                <td className="py-1.5 pr-4">
                                  {explain(s, true).status}
                                </td>
                                <td className="py-1.5 pr-4 text-right">{s.fetched_count}</td>
                                <td className="py-1.5 pr-4 text-right">{s.new_count}</td>
                                <td className="py-1.5 pr-4 text-right">{s.duplicate_count}</td>
                                <td className="py-1.5">{fmtDuration(s.duration_ms)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-ink-3">
                        Analysed {st.analyzed ?? 0} ({st.relevant ?? 0} relevant){st.newPainPoints ? ` · ${st.newPainPoints} new pain point(s)` : ""}
                        {st.pendingAfterRun ? ` · ${st.pendingAfterRun} left for the next run` : ""} · brief: {st.reportStatus ?? "—"} · model {r.model ?? "—"}
                      </p>
                      {st.reportError && <p className="text-up">Brief: {st.reportError}</p>}
                      {st.warnings && st.warnings.length > 0 && (
                        <ul className={cx("list-disc space-y-0.5 pl-4 text-ink-3")}>
                          {st.warnings.map((w, i) => (
                            <li key={i} className="break-words">
                              {w}
                            </li>
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
      </Section>
    </div>
  );
}
