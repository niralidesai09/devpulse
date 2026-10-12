// Home page: the latest weekly run at a glance.
//   1. Header with the week, last run and the protected "Run now" button
//   2. KPI cards
//   3. Topics ranked by Opportunity Score (with evidence links) + trend chart
//   4. The full Friday brief, exactly as emailed

import { connection } from "next/server";
import { RunNow } from "@/components/run-now";
import { ScoreExplainer, type ScoreContext } from "@/components/score-explainer";
import { TrendChart } from "@/components/trend-chart";
import { isAdmin } from "@/lib/admin";
import { getDashboard, type TopicCard } from "@/lib/db/dashboard";
import { fmtDate, fmtDateTime, fmtDuration, SOURCE_LABEL } from "@/lib/format";
import { markdownToHtml } from "@/lib/markdown";

export const maxDuration = 60;

export default async function HomePage() {
  await connection(); // always fresh data, never frozen at build time
  const [dashboard, unlocked] = await Promise.all([getDashboard(), isAdmin()]);

  if (!dashboard) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold">No data yet</h1>
        <p className="mt-2 text-ink-2">The first weekly run hasn&apos;t finished. Start one now:</p>
        <div className="mt-4">
          <RunNow unlocked={unlocked} />
        </div>
      </main>
    );
  }

  const { run, topics, brief, totals } = dashboard;
  const top = topics[0];
  const riser = fastestRiser(topics);
  const okSources = Object.entries(run.sources).filter(([, s]) => s.ok).length;
  const unresolvedPct = totals.kept ? Math.round((totals.unresolved / totals.kept) * 100) : 0;

  // Shared numbers the "Why this score?" panels compare against.
  const mostDiscussed = [...topics].sort((a, b) => b.mentions - a.mentions)[0];
  const scoreCtx: ScoreContext = {
    maxMentions: mostDiscussed?.mentions ?? 0,
    mostDiscussed: mostDiscussed?.name ?? "",
    maxRaw: Math.max(0, ...topics.map((t) => t.components.raw)),
    topTopic: top?.name ?? "",
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      {/* 1. Header */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-ink-3 uppercase">
            Week {fmtDate(run.windowStart)} – {fmtDate(run.windowEnd)}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance sm:text-[28px]">
            What developers are struggling with this week
          </h1>
          <p className="mt-1 text-sm text-ink-3">
            Last run {fmtDateTime(run.finishedAt)} · {run.trigger === "cron" ? "scheduled" : "manual"} ·{" "}
            <span className={run.status === "success" ? "text-good" : "text-warn"}>{run.status}</span> ·{" "}
            {fmtDuration(run.startedAt, run.finishedAt)}
          </p>
        </div>
        <RunNow unlocked={unlocked} />
      </section>

      {/* 2. KPI cards */}
      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Key numbers">
        <Kpi label="Relevant posts" value={String(totals.kept)} note={`of ${totals.collected} collected · ${okSources} sources OK`} />
        <Kpi label="Top opportunity" value={top?.name ?? "–"} note={top ? `score ${top.opportunityScore} · ${top.mentions} mentions` : ""} small />
        <Kpi
          label="Fastest riser"
          value={riser?.name ?? "Nothing rising"}
          note={riser ? `${riser.trendLabel} vs last week` : "no topic grew this week"}
          small
        />
        <Kpi label="Unresolved" value={`${unresolvedPct}%`} note={`${totals.unresolved} of ${totals.kept} posts have no working fix`} />
      </section>

      {/* 3. Ranked topics + chart */}
      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <h2 className="text-sm font-semibold">Topics ranked by opportunity</h2>
          <p className="mt-0.5 text-xs text-ink-3">
            Score 0–100 = frequency × growth × unresolved share × severity. 100 = biggest opportunity this week.
          </p>
          <ol className="mt-3 space-y-3">
            {topics.map((t, i) => (
              <TopicRow key={t.topicId} topic={t} rank={i + 1} ctx={scoreCtx} />
            ))}
          </ol>
        </div>
        <aside className="self-start rounded-xl border border-line bg-surface p-4 lg:sticky lg:top-4">
          <h2 className="text-sm font-semibold">Week over week</h2>
          <p className="mt-0.5 mb-3 text-xs text-ink-3">Keyword matches, this week vs the 7 days before</p>
          <TrendChart
            data={topics.map((t) => ({
              topic: t.name,
              thisWeek: t.keywordsThisWeek ?? 0,
              lastWeek: t.keywordsLastWeek ?? 0,
              trendLabel: t.trendLabel,
            }))}
          />
        </aside>
      </section>

      {/* 4. The brief */}
      <section className="mt-10 rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-6">
          <h2 className="text-sm font-semibold">This week&apos;s brief</h2>
          {brief && (
            <p className="text-xs text-ink-3">
              {brief.emailedAt ? `Emailed ${fmtDateTime(brief.emailedAt)}` : brief.emailError ? `Email failed: ${brief.emailError}` : "Not emailed"}
              {brief.model ? ` · written by ${brief.model}` : ""}
            </p>
          )}
        </div>
        {brief ? (
          <article className="brief px-4 py-5 sm:px-6" dangerouslySetInnerHTML={{ __html: markdownToHtml(brief.markdown) }} />
        ) : (
          <p className="px-4 py-5 text-sm text-ink-3 sm:px-6">No brief for this run (see the Runs page for the error).</p>
        )}
      </section>
    </main>
  );
}

/** Biggest % increase; otherwise the "new" topic with the most matches. */
function fastestRiser(topics: TopicCard[]): TopicCard | null {
  const up = topics.filter((t) => t.trend === "up").sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
  if (up.length) return up[0];
  const fresh = topics.filter((t) => t.trend === "new").sort((a, b) => (b.keywordsThisWeek ?? 0) - (a.keywordsThisWeek ?? 0));
  return fresh[0] ?? null;
}

function Kpi({ label, value, note, small }: { label: string; value: string; note: string; small?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs text-ink-3">{label}</p>
      <p className={`tabular mt-1 font-semibold tracking-tight ${small ? "text-base leading-snug" : "text-2xl"}`}>{value}</p>
      <p className="mt-1 text-xs text-ink-3">{note}</p>
    </div>
  );
}

function TopicRow({ topic: t, rank, ctx }: { topic: TopicCard; rank: number; ctx: ScoreContext }) {
  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="tabular mt-0.5 w-5 shrink-0 text-sm text-ink-3">{rank}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-medium">{t.name}</h3>
            <span className="tabular shrink-0 font-mono text-lg leading-none font-medium" aria-label={`Opportunity score ${t.opportunityScore} of 100`}>
              {t.opportunityScore}
              <span className="text-xs text-ink-3">/100</span>
            </span>
          </div>
          {/* Thin score bar */}
          <div className="mt-2 h-1 rounded-full bg-surface-2" aria-hidden>
            <div className="h-1 rounded-full bg-accent" style={{ width: `${t.opportunityScore}%` }} />
          </div>
          <dl className="tabular mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2">
            <Stat label="Mentions" value={String(t.mentions)} />
            <Stat label="Trend" value={t.trendLabel} />
            <Stat label="Unresolved" value={`${t.unresolvedPct}%`} />
            <Stat label="Severity" value={t.avgSeverity === null ? "–" : `${t.avgSeverity.toFixed(1)}/5`} />
          </dl>
          {t.mentions > 0 && <ScoreExplainer topic={t} ctx={ctx} />}
          {t.evidence.length > 0 && (
            <div className="mt-3 border-t border-line pt-3">
              <h4 className="text-xs font-medium text-ink-3">Top evidence</h4>
              <ul className="mt-1.5 space-y-2 text-sm">
                {t.evidence.map((e) => (
                  <li key={e.url} className="min-w-0">
                    <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      {e.title}
                    </a>
                    <span className="text-xs text-ink-3"> · {SOURCE_LABEL[e.source] ?? e.source}</span>
                    {e.painPoint && <p className="text-xs text-ink-2">{e.painPoint}</p>}
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-ink-3">
                      <span className={e.isUnresolved ? "text-warn" : "text-good"}>{e.isUnresolved ? "Unresolved" : "Resolved"}</span>
                      {e.severity !== null && <span>Severity {e.severity}/5</span>}
                      {e.unresolvedReason && <span className="min-w-0">{e.unresolvedReason}</span>}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1">
      <dt className="text-ink-3">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
