// Overview: the week's decision in one screen.
//   1. Heading, reporting period, freshness and source health (+ Run now)
//   2. Four-figure ledger (real, defined figures only)
//   3. The lead problem (largest) and the ranked top three opportunities
//   4. What is moving: HN keyword chart + new / accelerating topics
//   5. The Friday brief, exactly as emailed

import { connection } from "next/server";
import Link from "next/link";
import { RunNow } from "@/components/run-now";
import { TrendChart } from "@/components/trend-chart";
import {
  EmptyState,
  LifecycleState,
  PageHeader,
  ProvenanceLabel,
  RecordRow,
  Section,
  ShareBar,
  Sheet,
  SourceHealthIcon,
  TextLink,
} from "@/components/ui";
import { isAdmin } from "@/lib/admin";
import { getDashboard, getSuggestions, sourceOutcome, type Dashboard, type TopicCard } from "@/lib/db/dashboard";
import { fmtDate, fmtDateTime, SOURCE_LABEL } from "@/lib/format";
import { markdownToHtml } from "@/lib/markdown";

export const maxDuration = 60;

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default async function OverviewPage() {
  await connection(); // always fresh data, never frozen at build time
  const [dashboard, unlocked, suggestions] = await Promise.all([getDashboard(), isAdmin(), getSuggestions()]);

  if (!dashboard) {
    return (
      <main className="mx-auto max-w-[1200px] px-5 py-8 lg:px-10">
        <PageHeader title="The developer signal this week" actions={<RunNow unlocked={unlocked} />} />
        <div className="mt-6">
          <EmptyState title="No data has been collected yet">
            Groundswell collects from Hacker News, GitHub Issues, Stack Overflow and DEV.to every Friday at 8:00 AM IST. Start a run now to see this
            week&apos;s signal.
          </EmptyState>
        </div>
      </main>
    );
  }

  const { run, topics, totals, brief } = dashboard;
  const ranked = topics.filter((t) => t.mentions > 0);
  const lead = ranked[0];

  return (
    <main className="mx-auto max-w-[1200px] space-y-8 px-5 py-6 lg:px-10 lg:py-7">
      <div>
        <PageHeader
          title="The developer signal this week"
          description={
            <p>
              Week {fmtDate(run.windowStart)} – {fmtDate(run.windowEnd)} · last successful collection{" "}
              <time dateTime={run.finishedAt ?? undefined}>{fmtDateTime(run.finishedAt)}</time>
            </p>
          }
          actions={<RunNow unlocked={unlocked} />}
        />
        <SourceHealth dashboard={dashboard} />
      </div>

      <Ledger dashboard={dashboard} pendingSuggestions={suggestions.pending.length} />

      {lead ? (
        // Same 4-column armature as the ledger: the lead spans 3 columns and
        // the side column sits under the ledger's 4th, sharing its rule.
        <div className="-mt-8 grid grid-cols-[minmax(0,1fr)] gap-y-10 xl:grid-cols-4">
          <div className="min-w-0 pt-8 xl:col-span-3 xl:pr-10">
            <LeadProblem topic={lead} />
          </div>
          <aside className="min-w-0 space-y-7 pt-8 xl:border-l xl:border-line xl:pl-4">
            <TopOpportunities topics={ranked.slice(0, 3)} />
            <MovingNow topics={topics} />
          </aside>
        </div>
      ) : (
        <EmptyState title="No relevant discussions in this run">
          The latest run collected {totals.collected} posts, but none were judged relevant to a monitored topic. Check the keywords on the{" "}
          <Link href="/topics" className="underline">
            Topics
          </Link>{" "}
          page.
        </EmptyState>
      )}

      <Moving topics={topics} suggestions={suggestions.pending} />

      <Section
        id="brief"
        title="The Friday brief"
        description={
          brief
            ? brief.emailedAt
              ? `Emailed ${fmtDateTime(brief.emailedAt)}. Figures are computed from the collected data; the commentary is AI-assisted and links to its sources.`
              : brief.emailError
                ? `Not emailed: ${brief.emailError}`
                : "Written, not emailed."
            : undefined
        }
      >
        {brief ? (
          <Sheet className="px-5 py-6 sm:px-8">
            <article className="brief" dangerouslySetInnerHTML={{ __html: markdownToHtml(brief.markdown) }} />
          </Sheet>
        ) : (
          <EmptyState title="No brief for this run">
            The brief could not be written for the latest run. The error is recorded on the{" "}
            <Link href="/runs" className="underline">
              Runs
            </Link>{" "}
            page.
          </EmptyState>
        )}
      </Section>
    </main>
  );
}

/** Compact source health: what each source returned in the run shown. */
function SourceHealth({ dashboard }: { dashboard: Dashboard }) {
  const { run, latestAttempt } = dashboard;
  const newerFailure = latestAttempt && latestAttempt.id !== run.id && latestAttempt.status === "failed";
  return (
    <div className="mt-3 space-y-2">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-ink-2" aria-label="Source health for this run">
        {Object.entries(run.sources).map(([name, s]) => {
          const outcome = sourceOutcome(s);
          return (
            <li key={name} className="flex items-center gap-1.5">
              <SourceHealthIcon outcome={outcome} />
              <span>{SOURCE_LABEL[name] ?? name}</span>
              <span className="tabular text-ink-3">{s.count} collected</span>
              {outcome !== "ok" && <span className="text-warn">({outcome})</span>}
            </li>
          );
        })}
        <li>
          <TextLink href="/runs">Run details</TextLink>
        </li>
      </ul>
      {newerFailure && (
        <p className="text-[13px] text-warn" role="status">
          A newer run on {fmtDateTime(latestAttempt.startedAt)} failed, so these figures are from the last successful collection.
        </p>
      )}
    </div>
  );
}

/** Four defined figures in one ruled row (tabular, not floating tiles). */
function Ledger({ dashboard, pendingSuggestions }: { dashboard: Dashboard; pendingSuggestions: number }) {
  const { totals, previousComparable } = dashboard;
  const items = [
    {
      label: "Relevant discussions",
      value: String(totals.kept),
      unit: "",
      note: `Of ${totals.collected} collected, after AI relevance filtering; each counted once.`,
      compare: previousComparable ? `${previousComparable.kept} in the previous weekly run` : "No comparable previous week yet",
    },
    {
      label: "Pain-point topics active",
      value: String(totals.activeTopics),
      unit: `of ${totals.monitoredTopics}`,
      note: "Monitored topics with at least one relevant discussion.",
      compare: null,
    },
    {
      label: "Emerging issues",
      value: String(pendingSuggestions),
      unit: pendingSuggestions === 1 ? "suggestion" : "suggestions",
      note: `Awaiting your review; from ${plural(totals.unmonitored, "discussion")} that fit no topic.`,
      compare: null,
    },
    {
      label: "Unresolved share",
      value: `${pct(totals.unresolved, totals.kept)}%`,
      unit: "",
      note: `${totals.unresolved} of ${totals.kept} show no working fix (AI-assessed from source signals).`,
      compare: null,
    },
  ];
  return (
    <section aria-label="Key figures">
      <dl className="grid grid-cols-2 border-y border-line lg:grid-cols-4">
        {items.map((it, i) => (
          <div
            key={it.label}
            className={`py-4 pr-4 ${i % 2 === 1 ? "border-l border-line pl-4" : ""} ${i >= 2 ? "border-t border-line lg:border-t-0" : ""} ${i === 2 ? "lg:border-l lg:pl-4" : ""}`}
          >
            <dt className="text-[13px] font-medium text-ink-2">{it.label}</dt>
            <dd className="mt-1">
              <span className="tabular text-[32px] leading-none font-semibold tracking-[-0.02em]">{it.value}</span>
              {it.unit && <span className="ml-1.5 text-[14px] text-ink-3">{it.unit}</span>}
            </dd>
            <dd className="mt-2 text-[12.5px] leading-snug text-ink-3">{it.note}</dd>
            {it.compare && <dd className="tabular mt-1 text-[12.5px] text-ink-2" title="Week-on-week figures need a previous weekly run with every source complete">{it.compare}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}

function sourcesLine(sources: Record<string, number>) {
  return Object.entries(sources)
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `${SOURCE_LABEL[s] ?? s} ${n}`)
    .join(" · ");
}

/** The single most important problem: the largest element on the page. */
function LeadProblem({ topic: t }: { topic: TopicCard }) {
  return (
    <section aria-labelledby="lead-heading" className="min-w-0">
      <h2 id="lead-heading" className="font-serif text-[26px] leading-[1.2] font-semibold tracking-[-0.015em] text-balance sm:text-[30px]">
        {t.name} is this week&apos;s most pressing problem.
      </h2>

      <div className="mt-4 space-y-1.5">
        <ProvenanceLabel kind="observed" />
        <p className="tabular text-[15px] text-ink">
          {plural(t.mentions, "relevant discussion")} · {t.unresolvedPct}% unresolved
          {t.avgSeverity !== null && <> · severity {t.avgSeverity.toFixed(1)} of 5</>}
        </p>
        <p className="tabular text-[13px] text-ink-3">
          {sourcesLine(t.sources)} · relative Opportunity Score {t.opportunityScore} · Hacker News keyword matches{" "}
          <LifecycleState trend={t.trend} changePct={t.changePct} thisWeek={t.keywordsThisWeek} lastWeek={t.keywordsLastWeek} />
        </p>
      </div>

      <div className="mt-5 border-t border-line">
        <div className="divide-y divide-line">
          {t.evidence.map((e) => (
            <RecordRow
              key={e.url}
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
        <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
          <TextLink href={`/evidence?topic=${t.topicId}`}>All {plural(t.mentions, "discussion")}</TextLink>
          <TextLink href={`/opportunities#topic-${t.topicId}`}>Why it ranks first</TextLink>
        </p>
      </div>
      {t.note && (
        <div className="mt-6 border-t border-line pt-4">
          <ProvenanceLabel kind="ai" />
          <p className="mt-2 max-w-[68ch] font-serif text-[17px] leading-relaxed text-ink">{t.note.struggle}</p>
          <p className="mt-1.5 max-w-[68ch] text-[14px] text-ink-2">
            <span className="font-medium text-ink">Suggested opportunity: </span>
            {t.note.whyItMatters}
          </p>
        </div>
      )}

    </section>
  );
}

function TopOpportunities({ topics }: { topics: TopicCard[] }) {
  return (
    <Section
      title="Top opportunities"
      description="By relative Opportunity Score (top = 100)."
      className="min-w-0"
    >
      <ol className="divide-y divide-line border-y border-line">
        {topics.map((t, i) => (
          <li key={t.topicId} className="py-3">
            <div className="flex items-baseline gap-3">
              <span className="tabular w-4 shrink-0 font-mono text-[13px] text-ink-3">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <Link href={`/opportunities#topic-${t.topicId}`} className="text-[15px] font-semibold text-ink hover:underline">
                    {t.name}
                  </Link>
                  <span className="tabular shrink-0 font-mono text-[13px] text-ink-2">{t.opportunityScore}</span>
                </div>
                <div className="mt-1.5">
                  <ShareBar value={t.opportunityScore / 100} label={`Relative Opportunity Score ${t.opportunityScore} of 100`} />
                </div>
                <p className="tabular mt-1.5 text-[12.5px] text-ink-3">
                  {plural(t.mentions, "discussion")} · {t.unresolvedPct}% unresolved
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-2">
        <TextLink href="/opportunities">All opportunities and AI notes</TextLink>
      </p>
    </Section>
  );
}

/** First-viewport summary of movement: lifecycle states from HN keyword matches. */
function MovingNow({ topics }: { topics: TopicCard[] }) {
  const order: Record<string, number> = { new: 0, up: 1, down: 2, flat: 3 };
  const comparable = topics.filter((t) => t.trend in order).sort((a, b) => order[a.trend] - order[b.trend] || (b.changePct ?? 0) - (a.changePct ?? 0));
  const tooFew = topics.filter((t) => t.trend === "low_data" || t.trend === "no_data").length;
  return (
    <Section
      title="Moving this week"
      description={
        <>
          Hacker News keyword matches. {tooFew} {tooFew === 1 ? "topic has" : "topics have"} too few to compare.{" "}
          <TextLink href="#moving">Full chart</TextLink>
        </>
      }
    >
      {comparable.length ? (
        <ul className="divide-y divide-line border-y border-line">
          {comparable.slice(0, 5).map((t) => (
            <li key={t.topicId} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
              <Link href={`/opportunities#topic-${t.topicId}`} className="min-w-0 truncate font-medium text-ink hover:underline" title={t.name}>
                {t.name}
              </Link>
              <span className="shrink-0 text-[12.5px]">
                <LifecycleState trend={t.trend} changePct={t.changePct} thisWeek={t.keywordsThisWeek} lastWeek={t.keywordsLastWeek} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-ink-2">No topic has enough matches to call a direction.</p>
      )}
    </Section>
  );
}

/** Full week-over-week chart + suggestions not yet monitored, on the same armature. */
function Moving({ topics, suggestions }: { topics: TopicCard[]; suggestions: { id: string; name: string; postCount: number }[] }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-y-10 xl:grid-cols-4">
      <Section
        id="moving"
        title="Week over week: Hacker News keyword matches"
        description="Hacker News only, this week vs the 7 days before. Mentions across all four sources are compared once a previous weekly run exists."
        className="min-w-0 xl:col-span-3 xl:pr-10"
      >
        <Sheet className="p-4">
          <TrendChart
            data={topics
              .filter((t) => t.trend !== "low_data" && t.trend !== "no_data")
              .map((t) => ({
                topic: t.name,
                thisWeek: t.keywordsThisWeek ?? 0,
                lastWeek: t.keywordsLastWeek ?? 0,
                trendLabel: t.trendLabel,
              }))}
          />
          {topics.some((t) => t.trend === "low_data" || t.trend === "no_data") && (
            <p className="mt-3 border-t border-line pt-3 text-[12.5px] text-ink-3">
              Too few to compare (under 5 matches across both weeks):{" "}
              {topics
                .filter((t) => t.trend === "low_data" || t.trend === "no_data")
                .map((t) => `${t.name} (${t.keywordsLastWeek ?? 0} → ${t.keywordsThisWeek ?? 0})`)
                .join(", ")}
              . <TextLink href="/trends">All topics on Trends</TextLink>
            </p>
          )}
        </Sheet>
      </Section>

      <Section
        title="Not yet monitored"
        description="Suggested by the AI from discussions that fit no monitored topic."
        className="min-w-0 xl:border-l xl:border-line xl:pl-4"
      >
        {suggestions.length ? (
          <ul className="divide-y divide-line border-y border-line">
            {suggestions.slice(0, 5).map((s) => (
              <li key={s.id} className="py-2.5 text-[13.5px]">
                <Link href="/opportunities#radar" className="font-medium text-ink hover:underline">
                  {s.name}
                </Link>
                <p className="tabular text-[12.5px] text-ink-3">{plural(s.postCount, "thread")} as evidence</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-ink-3">No new topic suggestions this week.</p>
        )}
        <p className="mt-2">
          <TextLink href="/opportunities#radar">Review suggestions</TextLink>
        </p>
      </Section>
    </div>
  );
}
