// Opportunities: every monitored topic ranked by relative Opportunity Score.
// Each entry separates what was OBSERVED (computed from stored discussions)
// from the AI INTERPRETATION, and keeps its source records one click away.
// Below: the Emerging Topic Radar, the competitor radar and likely objections.

import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { CompetitorPanel } from "@/components/competitor-panel";
import { EmergingRadar } from "@/components/emerging-radar";
import { ObjectionsPanel } from "@/components/objections-panel";
import { ScoreExplainer, type ScoreContext } from "@/components/score-explainer";
import { EmptyState, LifecycleState, PageHeader, ProvenanceLabel, RecordRow, ShareBar, TextLink } from "@/components/ui";
import { isAdmin } from "@/lib/admin";
import { getDashboard, getSuggestions, type TopicCard } from "@/lib/db/dashboard";
import { fmtDate, SOURCE_LABEL } from "@/lib/format";

export const metadata: Metadata = { title: "Opportunities" };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default async function OpportunitiesPage() {
  await connection();
  const [dashboard, suggestions, unlocked] = await Promise.all([getDashboard(), getSuggestions(), isAdmin()]);

  if (!dashboard) {
    return (
      <main className="mx-auto max-w-[1200px] px-5 py-8 lg:px-10">
        <PageHeader title="Opportunities" />
        <div className="mt-6">
          <EmptyState title="No data yet">Opportunities appear after the first collection run.</EmptyState>
        </div>
      </main>
    );
  }

  const { topics, run, competitors, objections } = dashboard;
  const active = topics.filter((t) => t.mentions > 0);
  const quiet = topics.filter((t) => t.mentions === 0);
  const mostDiscussed = [...active].sort((a, b) => b.mentions - a.mentions)[0];
  const ctx: ScoreContext = {
    maxMentions: mostDiscussed?.mentions ?? 0,
    mostDiscussed: mostDiscussed?.name ?? "",
    maxRaw: Math.max(0, ...topics.map((t) => t.components.raw)),
    topTopic: active[0]?.name ?? "",
  };

  return (
    <main className="mx-auto max-w-[1200px] space-y-12 px-5 py-6 lg:px-10 lg:py-8">
      <PageHeader
        title="Opportunities"
        description={
          <p>
            Monitored topics for the week {fmtDate(run.windowStart)} – {fmtDate(run.windowEnd)}, ranked by relative Opportunity Score. Measured
            figures come from the collected discussions; AI interpretation is labelled and is a suggestion, not a market fact.
          </p>
        }
      />

      <div>
        {active.length === 0 ? (
          <EmptyState title="No topic had relevant discussions this week" />
        ) : (
          <ol className="border-t border-line">
            {active.map((t, i) => (
              <OpportunityEntry key={t.topicId} topic={t} rank={i + 1} ctx={ctx} />
            ))}
          </ol>
        )}
        {quiet.length > 0 && (
          <p className="mt-4 text-[13px] text-ink-3">
            No relevant discussions this week: {quiet.map((t) => t.name).join(", ")}.
          </p>
        )}
      </div>

      <EmergingRadar pending={suggestions.pending} decided={suggestions.decided} unlocked={unlocked} />

      <section className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-10 lg:grid-cols-2" aria-label="Competitor and objection radar">
        <CompetitorPanel competitors={competitors} />
        <ObjectionsPanel objections={objections} />
      </section>
    </main>
  );
}

function OpportunityEntry({ topic: t, rank, ctx }: { topic: TopicCard; rank: number; ctx: ScoreContext }) {
  const facts: [string, React.ReactNode][] = [
    ["Discussions (all sources)", String(t.mentions)],
    ["Unresolved", `${t.unresolvedPct}% (${t.unresolvedCount} of ${t.mentions})`],
    ["Average severity", t.avgSeverity === null ? "–" : `${t.avgSeverity.toFixed(1)} of 5`],
    [
      "Hacker News keyword matches",
      <LifecycleState key="hn" trend={t.trend} changePct={t.changePct} thisWeek={t.keywordsThisWeek} lastWeek={t.keywordsLastWeek} />,
    ],
    ["vs previous weekly run", t.vsPreviousRun],
    [
      "Sources",
      Object.entries(t.sources)
        .sort((a, b) => b[1] - a[1])
        .map(([s, n]) => `${SOURCE_LABEL[s] ?? s} ${n}`)
        .join(" · "),
    ],
  ];

  return (
    <li id={`topic-${t.topicId}`} className="scroll-mt-20 border-b border-line py-8">
      <article className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <header className="flex items-start gap-3">
            <span className="tabular mt-1.5 w-5 shrink-0 font-mono text-[13px] text-ink-3">{rank}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-serif text-[22px] leading-snug font-semibold tracking-[-0.01em]">{t.name}</h2>
                <p className="shrink-0 text-right">
                  <span className="tabular font-mono text-[22px] font-medium">{t.opportunityScore}</span>
                  <span className="block text-[11.5px] text-ink-3">relative score</span>
                </p>
              </div>
              <div className="mt-2 max-w-md">
                <ShareBar value={t.opportunityScore / 100} label={`Relative Opportunity Score ${t.opportunityScore} of 100`} />
              </div>
            </div>
          </header>

          <div className="mt-5 sm:pl-8">
            <ProvenanceLabel kind="observed" />
            <dl className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-2.5 sm:grid-cols-2">
              {facts.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[12px] text-ink-3">{label}</dt>
                  <dd className="tabular text-[14px] text-ink">{value || "–"}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 border-t border-line pt-4">
              <ProvenanceLabel kind="ai" />
              {t.note ? (
                <>
                  <p className="mt-2 font-serif text-[16.5px] leading-relaxed">{t.note.struggle}</p>
                  <p className="mt-1.5 text-[14px] text-ink-2">
                    <span className="font-medium text-ink">Suggested opportunity: </span>
                    {t.note.whyItMatters}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-[13.5px] text-ink-3">
                  No AI note for this topic this week. The brief writes notes for the five highest-scoring topics only.
                </p>
              )}
            </div>

            <ScoreExplainer topic={t} ctx={ctx} />
          </div>
        </div>

        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-ink">Source records</h3>
          <p className="text-[12.5px] text-ink-3">Unresolved and most severe first. Titles and dates are original.</p>
          <div className="mt-2 divide-y divide-line border-y border-line">
            {t.evidence.map((e) => (
              <RecordRow
                key={e.url}
                compact
                source={e.source}
                externalId={e.externalId}
                title={e.title}
                url={e.url}
                postedAt={e.postedAt}
                unresolved={e.isUnresolved}
                severity={e.severity}
              />
            ))}
          </div>
          <p className="mt-2">
            <TextLink href={`/evidence?topic=${t.topicId}`}>Inspect all {plural(t.mentions, "discussion")}</TextLink>
          </p>
          {t.note && t.note.evidence.length > 0 && (
            <p className="mt-3 text-[12.5px] text-ink-3">
              The AI note cites{" "}
              {t.note.evidence.map((e, i) => (
                <span key={e.url}>
                  {i > 0 && ", "}
                  <a href={e.url} target="_blank" rel="noopener noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-ink">
                    {SOURCE_LABEL[e.source] ?? e.source} thread {i + 1}
                  </a>
                </span>
              ))}
              .
            </p>
          )}
          <p className="mt-3 text-[12.5px] text-ink-3">
            Want to watch this more closely? Adjust its keywords on <Link href="/topics" className="underline">Topics</Link>.
          </p>
        </div>
      </article>
    </li>
  );
}
