// Trends: how developer pain moves over time, with every limitation stated.
//   1. Relevant discussions per week (all sources) - a line only with ≥ 2
//      non-overlapping weekly runs; until then, this week by topic + why.
//   2. Week-over-week Hacker News keyword matches (HN only, labelled).
//   3. Resolved vs unresolved by topic (this week, all sources).
//   4. Where the discussions come from (collected vs relevant per source).

import type { Metadata } from "next";
import { connection } from "next/server";
import { ResolutionChart, SourceChart, TopicVolumeChart, WeeklyVolumeChart } from "@/components/charts";
import { TrendChart } from "@/components/trend-chart";
import { EmptyState, PageHeader, Section, Sheet } from "@/components/ui";
import { getDashboard, getWeeklyHistory } from "@/lib/db/dashboard";
import { fmtDate, fmtDateTime, nextScheduledRun, SOURCE_LABEL } from "@/lib/format";

export const metadata: Metadata = { title: "Trends" };

export default async function TrendsPage() {
  await connection();
  const [dashboard, history] = await Promise.all([getDashboard(), getWeeklyHistory()]);

  if (!dashboard) {
    return (
      <main className="mx-auto max-w-[1200px] px-5 py-8 lg:px-10">
        <PageHeader title="Trends" />
        <div className="mt-6">
          <EmptyState title="No data yet">Trends appear after the first collection run.</EmptyState>
        </div>
      </main>
    );
  }

  const { topics, run, totals } = dashboard;
  const withData = topics.filter((t) => t.mentions > 0);
  const notes = Object.entries(run.sources).flatMap(([s, st]) => (st.notes ?? []).map((n) => `${SOURCE_LABEL[s] ?? s}: ${n}`));

  return (
    <main className="mx-auto max-w-[1200px] space-y-12 px-5 py-6 lg:px-10 lg:py-8">
      <PageHeader
        title="Trends"
        description={
          <p>
            How developer pain moves over time. Two measurements are shown and never mixed: <strong className="font-medium text-ink">mentions</strong>{" "}
            (relevant discussions across all four sources) and <strong className="font-medium text-ink">Hacker News keyword matches</strong> (Hacker
            News only, the one source counted the same way for both weeks).
          </p>
        }
      />

      <Section
        title="Relevant discussions per week, all sources"
        description="One point per non-overlapping 7-day collection window. Weeks without a run are left out, never drawn as zero."
      >
        {history.length >= 2 ? (
          <Sheet className="p-4">
            <WeeklyVolumeChart points={history.map((h) => ({ week: fmtDate(h.weekEnding), kept: h.kept }))} />
          </Sheet>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <EmptyState title="Not enough history for a trend line yet">
              Weekly history starts with the week ending {fmtDate(run.windowEnd)}. A line needs at least two non-overlapping weekly runs; the next
              scheduled run is {fmtDateTime(nextScheduledRun().toISOString())}. Until then, this week is shown on its own, without a trend.
            </EmptyState>
            <Sheet className="p-4">
              <p className="mb-2 text-[12.5px] text-ink-3">This week only · {totals.kept} relevant discussions</p>
              <TopicVolumeChart data={withData.map((t) => ({ topic: t.name, mentions: t.mentions }))} />
            </Sheet>
          </div>
        )}
      </Section>

      <Section
        title="Week over week: Hacker News keyword matches"
        description="Hacker News stories and comments matching each topic's keywords, this week vs the 7 days before. Under 5 matches in total is marked too few to compare; no percentage is shown."
      >
        <Sheet className="p-4">
          <TrendChart
            data={topics.map((t) => ({
              topic: t.name,
              thisWeek: t.keywordsThisWeek ?? 0,
              lastWeek: t.keywordsLastWeek ?? 0,
              trendLabel: t.trendLabel,
            }))}
          />
        </Sheet>
      </Section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-12 xl:grid-cols-2">
        <Section
          title="Resolved vs unresolved, by topic"
          description="This week, all sources. Status is AI-assessed using source signals such as an open issue or a missing accepted answer."
          className="min-w-0"
        >
          <Sheet className="p-4">
            <ResolutionChart
              data={withData.map((t) => ({ topic: t.name, unresolved: t.unresolvedCount, resolved: t.mentions - t.unresolvedCount }))}
            />
          </Sheet>
        </Section>

        <Section
          title="Where the discussions come from"
          description="Collected = posts matching a keyword (before de-duplication); relevant = kept after AI relevance filtering and de-duplication."
          className="min-w-0"
        >
          <Sheet className="p-4">
            <SourceChart
              data={Object.entries(run.sources)
                .map(([s, st]) => ({ source: SOURCE_LABEL[s] ?? s, relevant: totals.bySource[s] ?? 0, collected: st.count }))
                .sort((a, b) => b.collected - a.collected)}
            />
          </Sheet>
          {notes.length > 0 && (
            <details className="mt-3 text-[12.5px] text-ink-3">
              <summary className="cursor-pointer text-ink-2 hover:text-ink">
                {notes.length} coverage {notes.length === 1 ? "limit" : "limits"} this run: busy sources are sampled, not fully covered
              </summary>
              <ul className="mt-2 list-disc space-y-0.5 pl-5">
                {notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </details>
          )}
        </Section>
      </div>
    </main>
  );
}
