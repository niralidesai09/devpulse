// Weekly Briefs — every saved report, newest first, plus comparison of two.

import { ArrowRight, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { RunControls } from "@/components/RunControls";
import { Badge, buttonClass, cx, EmptyState, ErrorPanel, inputClass, PageHeader, Section } from "@/components/ui";
import { isAdmin } from "@/lib/auth";
import { listReports } from "@/lib/db/reports";
import { getRunningRun } from "@/lib/db/runs";
import { safeLoad } from "@/lib/db/safe";
import { fmtDateTime, fmtPeriod } from "@/lib/format";

export const metadata: Metadata = { title: "Weekly Briefs" };

const STATUS = { succeeded: { tone: "ok", label: "Ready" }, failed: { tone: "bad", label: "Failed" }, generating: { tone: "accent", label: "Generating" } } as const;
const EMAIL: Record<string, string> = { sent: "Emailed", failed: "Email failed", pending: "Email pending", skipped: "Not emailed", not_configured: "" };

export default async function ReportsPage() {
  await connection();
  const [admin, loaded] = await Promise.all([isAdmin(), safeLoad(async () => ({ reports: await listReports(), running: await getRunningRun() }))]);
  if (!loaded.ok) return <ErrorPanel title="Could not load briefs" error={loaded.error} />;
  const { reports, running } = loaded.data;
  const ready = reports.filter((r) => r.status === "succeeded");

  return (
    <div className="space-y-12">
      <PageHeader
        title="Weekly Briefs"
        description="Every brief is saved exactly as it was written — numbers, AI summary and evidence links — so past weeks can be re-read and compared. A new one is written every Friday at 08:00 IST."
        actions={<RunControls isAdmin={admin} runningRunId={running?.id ?? null} />}
      />

      {reports.length === 0 ? (
        <EmptyState icon={<FileText className="size-8" strokeWidth={1.5} aria-hidden />} title="No briefs yet">
          The first brief is written after the first collection, or right away with “Generate brief” once discussions are stored.
        </EmptyState>
      ) : (
        <Section title="All briefs" description="Newest first.">
          <ul className="divide-y divide-line border-y border-line">
            {reports.map((r, i) => (
              <li key={r.id}>
                <Link href={`/reports/${r.id}`} className="group grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[15px] font-semibold text-ink group-hover:text-accent-ink">Week of {fmtPeriod(r.period_start, r.period_end)}</p>
                      {i === 0 && r.status === "succeeded" && <Badge tone="accent">Latest</Badge>}
                      <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                    </div>
                    <p className="mt-0.5 text-[13px] text-ink-3">
                      Generated {fmtDateTime(r.completed_at ?? r.created_at)} · {r.trigger === "cron" ? "scheduled" : "on demand"}
                      {EMAIL[r.email_status] ? ` · ${EMAIL[r.email_status]}` : ""}
                      {r.status === "failed" && r.error ? ` · ${r.error.slice(0, 90)}` : ""}
                    </p>
                  </div>
                  <span className="hidden items-center gap-1 text-[13px] font-medium text-ink-3 group-hover:text-accent-ink sm:inline-flex">
                    Read <ArrowRight className="size-3.5" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {ready.length >= 2 && (
        <Section title="Compare two briefs" description="See which problems appeared, disappeared, grew or declined between two saved briefs — using the numbers stored with each one.">
          <form action="/reports/compare" method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {(["a", "b"] as const).map((k, idx) => (
              <label key={k} className="grid flex-1 gap-1.5 text-[13px] font-medium text-ink-2">
                {idx === 0 ? "Earlier brief" : "Later brief"}
                <select name={k} defaultValue={ready[idx === 0 ? 1 : 0].id} className={cx(inputClass)}>
                  {ready.map((r) => (
                    <option key={r.id} value={r.id}>
                      {fmtPeriod(r.period_start, r.period_end)} · generated {fmtDateTime(r.completed_at)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <button type="submit" className={buttonClass("secondary")}>
              Compare
            </button>
          </form>
        </Section>
      )}
    </div>
  );
}
