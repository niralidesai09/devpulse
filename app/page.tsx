// Overview — an intelligence briefing, read top to bottom:
//   1. What happened        → the week in developer conversations (AI, cited)
//   2. How big              → four metrics, computed by code
//   3. What needs attention → top three pain points
//   4. What is moving       → topic movement, this week vs last
//   5. What to do           → recommended next actions (AI, cited)
//   6. Can I trust it       → source health

import { ArrowRight, FileText, Inbox } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { EvidenceLinks } from "@/components/Evidence";
import { RunControls } from "@/components/RunControls";
import {
  AiLabel,
  ButtonLink,
  cx,
  Divider,
  EmptyState,
  ErrorPanel,
  EvidenceMeter,
  Metric,
  PageHeader,
  PairBar,
  Section,
  SourceTag,
  StatusDot,
  TrendBadge,
} from "@/components/ui";
import { isAdmin } from "@/lib/auth";
import { LOOKBACK_WEEKS } from "@/lib/config";
import { safeLoad } from "@/lib/db/safe";
import { fmtDateTime, fmtRelative, sourceLabel, TZ_LABEL } from "@/lib/format";
import { loadOverview } from "@/lib/views/overview";

const STATE_TONE = { current: "ok", stale: "warn", incomplete: "warn", unavailable: "idle" } as const;

function changeText(current: number, previous: number, status: string) {
  if (status === "new") return "not seen last week";
  if (current === previous) return "same as last week";
  return `${current > previous ? "+" : "−"}${Math.abs(current - previous)} vs last week`;
}

export default async function OverviewPage() {
  await connection();
  const [admin, loaded] = await Promise.all([isAdmin(), safeLoad(loadOverview)]);

  const header = (actions?: ReactNode, meta?: ReactNode) => (
    <PageHeader
      title="Developer Pulse"
      description="Understand what developers are struggling with, and what your product should solve next."
      actions={actions}
      meta={meta}
    />
  );

  if (!loaded.ok) {
    return (
      <>
        {header()}
        <ErrorPanel
          title="The overview could not load its data"
          error={loaded.error}
          hint={loaded.isConfig ? "This is a setup problem, not missing data — see README → Setup." : "Try again in a minute. If it persists, open Sources & Data Health."}
        />
      </>
    );
  }

  const { metrics: m, report, reportIsCurrent, evidence, lastGoodRun, running, descriptions, sources, dataState } = loaded.data;
  const brief = reportIsCurrent ? report?.brief : null;
  const hasData = m.totals.current.unique + m.totals.previous.unique > 0;
  const attention = m.painPoints.filter((p) => p.current > 0).slice(0, 3);
  const topics = m.topics.filter((t) => t.current + t.previous > 0);
  const topicMax = Math.max(1, ...topics.flatMap((t) => [t.current, t.previous]));
  const notes = [...m.quality.warnings, ...(m.retrospective.note ? [m.retrospective.note] : [])];

  const meta = (
    <>
      <span>
        Week of <span className="text-ink-2">{m.current.label}</span> · Fri–Thu {TZ_LABEL}
      </span>
      <span title={lastGoodRun ? fmtDateTime(lastGoodRun.finished_at) : undefined}>Updated {lastGoodRun ? fmtRelative(lastGoodRun.finished_at) : "never"}</span>
      <span className="inline-flex items-center gap-1.5" title={dataState.detail}>
        <StatusDot tone={STATE_TONE[dataState.key]} />
        {dataState.label}
      </span>
    </>
  );

  if (!hasData) {
    return (
      <>
        {header(<RunControls isAdmin={admin} runningRunId={running?.id ?? null} showReport={false} />, meta)}
        <EmptyState
          icon={<Inbox className="size-8" strokeWidth={1.5} aria-hidden />}
          title="No discussions collected yet"
          action={admin ? undefined : <ButtonLink href="/login" variant="primary">Sign in to collect data</ButtonLink>}
        >
          The first collection reads the last {LOOKBACK_WEEKS} complete weeks from Hacker News, GitHub, Stack Overflow and DEV, so a full briefing is
          ready in a few minutes. Week-on-week trends become more reliable with every weekly run.
        </EmptyState>
      </>
    );
  }

  return (
    <div className="space-y-14">
      {header(<RunControls isAdmin={admin} runningRunId={running?.id ?? null} />, meta)}

      {/* 1 — What happened */}
      <section aria-labelledby="takeaway" className="-mt-4 rounded-[var(--radius-lg)] border border-line bg-panel px-6 py-6 sm:px-8 sm:py-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="takeaway" className="text-[12px] font-medium tracking-[0.06em] text-ink-3 uppercase">
            The week in developer conversations
          </h2>
          {brief && <AiLabel>Written by Gemini from {evidence.size} cited discussions</AiLabel>}
        </div>

        {brief ? (
          <>
            <p className="mt-3 max-w-3xl text-[19px] leading-[27px] font-semibold tracking-[-0.015em] text-ink sm:text-[22px] sm:leading-[30px]">{brief.headline}</p>
            <ol className="mt-6 grid gap-6 md:grid-cols-3 md:gap-8">
              {brief.executive_summary.slice(0, 3).map((b, i) => (
                <li key={i} className="min-w-0">
                  <span className="tabular text-[12px] font-medium text-ink-3">0{i + 1}</span>
                  <p className="mt-1 text-[14px] leading-[22px] text-ink-2">{b.text}</p>
                  <EvidenceLinks ids={b.evidence} docs={evidence} max={2} />
                </li>
              ))}
            </ol>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4 text-[13px]">
              <Link href={`/reports/${report!.id}`} className="inline-flex items-center gap-1 font-medium text-accent-ink hover:underline">
                Read the full weekly brief <ArrowRight className="size-3.5" aria-hidden />
              </Link>
              <span className="text-ink-3">Generated {fmtRelative(report!.completed_at)} · all counts are computed from stored discussions</span>
            </div>
          </>
        ) : (
          <div className="mt-3 max-w-2xl">
            <p className="text-[18px] leading-7 font-semibold text-ink">No brief has been written for this week yet.</p>
            <p className="mt-1.5 text-[14px] leading-6 text-ink-2">
              {report ? `The latest brief covers ${report.metrics.current.label}. ` : ""}
              The numbers below are live.{" "}
              {admin ? "Use “Generate brief” to write this week’s summary from the stored discussions (about a minute)." : "A new brief is written automatically every Friday at 08:00 IST."}
            </p>
            {report && (
              <Link href={`/reports/${report.id}`} className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-accent-ink hover:underline">
                <FileText className="size-3.5" aria-hidden /> Open the latest brief
              </Link>
            )}
          </div>
        )}

        {notes.length > 0 && (
          <details className="mt-5 text-[13px]">
            <summary className="cursor-pointer text-ink-3 marker:text-ink-3 hover:text-ink-2">
              About this week’s data — {notes.length} note{notes.length > 1 ? "s" : ""} on coverage and comparability
            </summary>
            <ul className="mt-2 grid list-disc gap-1.5 pl-5 text-ink-2">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* 2 — How big */}
      <section aria-label="Key numbers" className="grid grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr] lg:divide-x lg:divide-line">
        <Metric
          emphasis
          label="Relevant discussions"
          value={m.totals.current.relevant}
          comparison={<span className="tabular">{m.totals.previous.relevant} the week before</span>}
          explanation={`Posts describing a real developer problem in your space, out of ${m.totals.current.unique} collected this week.`}
          tip="Gemini Flash reads every collected post and keeps only those describing a code review, CI/CD or workflow problem. Open any discussion to see why it was kept."
        />
        <div className="lg:pl-8">
          <Metric
            label="Distinct pain points"
            value={m.totals.current.painPoints}
            comparison={<span className="tabular">{m.groups.new.length} newly observed</span>}
            explanation="Different problems raised this week. Different wordings of the same problem count once."
          />
        </div>
        <div className="lg:pl-8">
          <Metric
            label="Growing issues"
            value={m.quality.sufficientForTrend ? m.groups.growing.length : "—"}
            comparison={m.quality.sufficientForTrend ? <span className="tabular">{m.groups.declining.length} declining</span> : <span>Too early to tell</span>}
            explanation="Problems up by at least 2 discussions and 25% versus last week."
            tip="Only counted when both weeks have enough comparable data. Small moves such as 1 → 2 are never called growth."
          />
        </div>
        <div className="lg:pl-8">
          <Metric
            label="New opportunities"
            value={brief ? brief.opportunities.length : "—"}
            comparison={
              brief ? (
                <Link href="/opportunities" className="text-accent-ink hover:underline">
                  Review hypotheses
                </Link>
              ) : (
                <span>No brief yet</span>
              )
            }
            explanation="Product hypotheses from this week’s brief, each with an experiment to validate it."
          />
        </div>
      </section>

      {/* 3 — What needs attention */}
      <Section
        title="What needs attention"
        description="The three most important problems this week — ranked by how often, how widely, how unresolved and how fast they are moving."
        actions={
          <ButtonLink href="/pain-points" size="sm" variant="ghost">
            All pain points <ArrowRight className="size-3.5" aria-hidden />
          </ButtonLink>
        }
      >
        {attention.length ? (
          <ol className="divide-y divide-line border-y border-line">
            {attention.map((p, i) => (
              <li key={p.painPointId}>
                <Link href={`/pain-points/${p.painPointId}`} className="group grid gap-2 py-5 sm:grid-cols-[2rem_1fr_auto] sm:items-start sm:gap-5">
                  <span className="tabular text-[22px] leading-7 font-semibold text-line-strong transition-colors group-hover:text-accent">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-[16px] leading-6 font-semibold text-ink transition-colors group-hover:text-accent-ink">{p.title}</p>
                    {descriptions.get(p.painPointId) && <p className="mt-1 line-clamp-2 text-[14px] leading-[22px] text-ink-2">{descriptions.get(p.painPointId)}</p>}
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-ink-3">
                      <span className="tabular font-medium text-ink-2">
                        {p.current} discussion{p.current === 1 ? "" : "s"}
                      </span>
                      <span className="tabular">{changeText(p.current, p.previous, p.status)}</span>
                      <TrendBadge status={p.status} />
                      <EvidenceMeter discussions={p.current + p.previous} sources={p.sourcesAll.length} />
                    </div>
                  </div>
                  <span className="hidden items-center gap-1 self-center text-[13px] font-medium text-ink-3 transition-colors group-hover:text-accent-ink sm:inline-flex">
                    Inspect <ArrowRight className="size-3.5" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState title="No pain points identified this week">
            {m.totals.current.pending > 0 ? "Some discussions are still waiting for analysis; the next collection finishes them." : "Nothing relevant was classified for this week."}
          </EmptyState>
        )}
      </Section>

      <div className="grid grid-cols-1 gap-14 lg:grid-cols-2 lg:gap-12">
        {/* 4 — What is moving */}
        <Section
          title="Topic movement"
          description={
            m.comparableSources.length
              ? `Relevant discussions per monitored topic, from ${m.comparableSources.map(sourceLabel).join(" and ")} — the sources collected in full for both weeks.`
              : "No source was collected in full for both weeks yet, so topics cannot be compared."
          }
        >
          {topics.length ? (
            <>
              <div className="mb-4 flex items-center gap-4 text-[12px] text-ink-3" aria-hidden>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-4 rounded-full bg-[var(--bar-current)]" /> This week
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-4 rounded-full bg-[var(--bar-previous)]" /> Last week
                </span>
              </div>
              <ul className="grid gap-4">
                {topics.map((t) => (
                  <li key={t.topicId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5">
                    <span className="truncate text-[14px] text-ink">{t.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="tabular text-[13px] text-ink-2" aria-label={`${t.current} this week, ${t.previous} last week`}>
                        {t.current} <span className="text-ink-3">/ {t.previous}</span>
                      </span>
                      <TrendBadge status={t.status} />
                    </span>
                    <div className="col-span-2">
                      <PairBar current={t.current} previous={t.previous} max={topicMax} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-[14px] text-ink-3">No comparable topic data yet.</p>
          )}
        </Section>

        {/* 5 — What to do */}
        <Section title="Recommended next actions" description="What the brief suggests doing next, and why. Each action links to the discussions behind it.">
          {brief?.recommendations.length ? (
            <ol className="grid gap-6">
              {brief.recommendations.slice(0, 4).map((r, i) => (
                <li key={i} className="grid grid-cols-[1.5rem_1fr] gap-3">
                  <span className={cx("mt-0.5 flex size-6 items-center justify-center rounded-full text-[12px] font-semibold", r.priority === "now" ? "bg-accent text-white" : "bg-sunken text-ink-2")}>
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15px] leading-[22px] font-semibold text-ink">{r.title}</p>
                    <p className="mt-0.5 text-[12px] text-ink-3">
                      {r.priority === "now" ? "Do now" : r.priority === "next" ? "Do next" : "Later"} · {r.kind}
                    </p>
                    <p className="mt-1.5 text-[14px] leading-[22px] text-ink-2">
                      <span className="font-medium text-ink">Why: </span>
                      {r.rationale}
                    </p>
                    <EvidenceLinks ids={r.evidence} docs={evidence} max={2} />
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState title="No recommendations yet">Recommendations appear once this week’s brief has been written.</EmptyState>
          )}
        </Section>
      </div>

      <Divider />

      {/* 6 — Can I trust it */}
      <Section
        title="Sources"
        description={`Last successful collection ${lastGoodRun ? `${fmtRelative(lastGoodRun.finished_at)} (${fmtDateTime(lastGoodRun.finished_at)})` : "never"}. ${m.quality.sufficientForTrend ? "This week has enough comparable data for trends." : "This week has too little comparable data for reliable trends."}`}
        actions={
          <ButtonLink href="/health" size="sm" variant="ghost">
            Sources & Data Health <ArrowRight className="size-3.5" aria-hidden />
          </ButtonLink>
        }
      >
        <ul className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          {sources.map((s) => {
            const tone = !s.is_enabled || !s.latest ? "idle" : s.latest.status === "succeeded" ? "ok" : s.latest.status === "failed" ? "bad" : "warn";
            const stat = m.sources.find((x) => x.sourceId === s.id);
            const text = !s.is_enabled
              ? "Disabled"
              : !s.latest
                ? "Not collected yet"
                : s.latest.status === "succeeded"
                  ? s.latest.truncated
                    ? "Working · sampled"
                    : "Working"
                  : s.latest.status === "partial"
                    ? "Partly working"
                    : "Failed last time";
            return (
              <li key={s.id} className="min-w-0">
                <div className="flex items-center gap-2 text-[14px] font-medium text-ink">
                  <StatusDot tone={tone} />
                  <SourceTag source={s.id} />
                </div>
                <p className="mt-0.5 pl-4 text-[13px] text-ink-3">
                  {text}
                  {stat ? ` · ${stat.relevantCurrent} relevant this week` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
