// Overview — answers, in order: what are developers talking about, what is
// growing, what is fading, what is unresolved, what should we do next, and
// what evidence supports it. Deterministic numbers and AI text are labelled.

import Link from "next/link";
import { connection } from "next/server";
import { TopicCompareChart, VolumeChart } from "@/components/charts";
import { EvidenceChips } from "@/components/Evidence";
import { PainPointTable } from "@/components/PainPointTable";
import { RunControls } from "@/components/RunControls";
import {
  AiBadge,
  Badge,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorPanel,
  MiniBar,
  PageHeader,
  SourceBadge,
  Stat,
  TrendBadge,
} from "@/components/ui";
import type { PainPointMetric } from "@/lib/analytics/metrics";
import { isAdmin } from "@/lib/auth";
import { LOOKBACK_WEEKS } from "@/lib/config";
import { safeLoad } from "@/lib/db/safe";
import { fmtDateTime, fmtRelative, fmtSigned, sourceColorVar, sourceLabel, TZ_LABEL } from "@/lib/format";
import { loadOverview } from "@/lib/views/overview";

function ChangeList({ items, empty }: { items: PainPointMetric[]; empty: string }) {
  if (!items.length) return <p className="text-xs text-text-3">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.slice(0, 4).map((p) => (
        <li key={p.painPointId} className="flex items-start justify-between gap-3 text-sm">
          <Link href={`/pain-points/${p.painPointId}`} className="min-w-0 text-text hover:underline">
            {p.title}
          </Link>
          <span className="tabular shrink-0 text-xs text-text-2">
            {p.previous} → {p.current}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function OverviewPage() {
  await connection();
  const [admin, loaded] = await Promise.all([isAdmin(), safeLoad(loadOverview)]);

  if (!loaded.ok) {
    return (
      <>
        <PageHeader title="Developer Community Pulse" />
        <ErrorPanel title="The dashboard could not load its data" error={loaded.error} hint={loaded.isConfig ? "This is a configuration problem, not missing data — see README → Setup." : "Try again in a minute. If it persists, check Data health."} />
      </>
    );
  }

  const { metrics: m, report, reportIsCurrent, evidence, lastGoodRun, lastRun, running, decisions, metricsSource } = loaded.data;
  const brief = reportIsCurrent ? report?.brief : null;
  const pp = m.painPoints;
  const byId = new Map(pp.map((p) => [p.painPointId, p]));
  const growing = m.groups.growing.map((id) => byId.get(id)!).filter(Boolean);
  const emerging = m.groups.new.map((id) => byId.get(id)!).filter(Boolean).sort((a, b) => b.current - a.current);
  const declining = [...m.groups.declining, ...m.groups.gone].map((id) => byId.get(id)!).filter(Boolean);
  const unresolved = pp
    .filter((p) => p.current >= 2 && p.unresolvedCurrent / p.current >= 0.5)
    .sort((a, b) => b.unresolvedCurrent - a.unresolvedCurrent || b.signalScore - a.signalScore)
    .slice(0, 5);
  const hasData = m.totals.current.unique + m.totals.previous.unique > 0;
  const maxSource = Math.max(1, ...m.sources.map((s) => s.current));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <span className="inline-flex flex-wrap items-center gap-x-2">
            <span>Reporting week {m.current.label}</span>
            <span className="text-text-3">· Fri–Thu, {TZ_LABEL}</span>
          </span>
        }
        title="What developers are saying this week"
        description={
          <>
            Last successful collection{" "}
            <strong className="font-medium text-text">{lastGoodRun ? fmtRelative(lastGoodRun.finished_at) : "never"}</strong>
            {lastGoodRun && <span className="text-text-3"> ({fmtDateTime(lastGoodRun.finished_at)})</span>}
            {lastRun && lastRun.status === "failed" && (
              <>
                {" · "}
                <Link href="/health" className="text-bad hover:underline">
                  latest run failed
                </Link>
              </>
            )}
            . Numbers are computed from stored discussions{metricsSource === "report" ? " (snapshot from the current brief)" : " (live)"}.
          </>
        }
        actions={<RunControls isAdmin={admin} runningRunId={running?.id ?? null} />}
      />

      {!hasData && (
        <EmptyState
          title="No discussions collected yet"
          action={admin ? undefined : <ButtonLink href="/login" variant="primary">Sign in to start the first collection</ButtonLink>}
        >
          The first collection looks back {LOOKBACK_WEEKS} complete weeks across Hacker News, GitHub Issues, Stack Overflow and DEV, so a current
          report is available immediately. Week-on-week trends compare like-for-like sources and become more reliable with every weekly run.
        </EmptyState>
      )}

      {hasData && m.quality.warnings.length > 0 && (
        <Callout tone="warn" title="Read these numbers with care">
          <ul className="list-disc space-y-0.5 pl-4">
            {m.quality.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
            {m.retrospective.note && <li>{m.retrospective.note}</li>}
          </ul>
        </Callout>
      )}

      {hasData && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Unique discussions"
            hint="Distinct threads/issues/posts published this week that matched a monitored keyword, after deduplication, across all sources (excludes items you excluded)."
            value={<span className="tabular">{m.totals.current.unique}</span>}
            sub={`previous week ${m.totals.previous.unique}`}
          />
          <Stat
            label="Relevant to our market"
            hint="Of the unique discussions, how many Gemini Flash judged to describe a real developer pain point or opinion in scope. Classification is an AI judgement — open any discussion to see the reasoning."
            value={<span className="tabular">{m.totals.current.relevant}</span>}
            sub={
              <>
                previous {m.totals.previous.relevant}
                {m.totals.current.pending > 0 && <span className="text-warn"> · {m.totals.current.pending} awaiting analysis</span>}
              </>
            }
          />
          <Stat
            label="Distinct pain points"
            hint="Canonical problems (semantic groups) with at least one relevant discussion this week. Different wordings of the same problem are grouped together."
            value={<span className="tabular">{m.totals.current.painPoints}</span>}
            sub={`${m.groups.new.length} new · ${m.groups.recurring.length} recurring`}
          />
          <Stat
            label="AI recommendations"
            hint="Recommendations written by Gemini Flash in this week's brief. Each one must cite at least one stored discussion or it is removed."
            value={<span className="tabular">{brief ? brief.recommendations.length : "—"}</span>}
            sub={brief ? `from the brief generated ${fmtRelative(report!.completed_at)}` : "no brief for this week yet"}
          />
        </div>
      )}

      {hasData && (
        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                This week&apos;s brief <AiBadge />
              </span>
            }
            description={brief ? `Generated ${fmtDateTime(report!.completed_at)} with ${report!.model}. Every bullet cites stored discussions.` : undefined}
            actions={report && <ButtonLink href={`/reports/${report.id}`} size="sm">{reportIsCurrent ? "Open full report" : "Open latest report"}</ButtonLink>}
          />
          <CardBody>
            {brief ? (
              <>
                <p className="text-[15px] font-medium leading-snug text-text">{brief.headline}</p>
                <ul className="mt-3 space-y-2.5">
                  {brief.executive_summary.map((b, i) => (
                    <li key={i} className="text-sm text-text-2">
                      <p>{b.text}</p>
                      <div className="mt-1">
                        <EvidenceChips ids={b.evidence} docs={evidence} />
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <EmptyState title="No brief for this reporting week yet">
                {report
                  ? `The latest brief covers ${report.metrics.current.label}. `
                  : "No brief has been generated yet. "}
                The numbers on this page are live. {admin ? "Use “Generate brief” to write one from the stored data (about a minute)." : "An admin can generate one; the Friday schedule does it automatically."}
              </EmptyState>
            )}
          </CardBody>
        </Card>
      )}

      {hasData && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader
              title="Top recurring pain points"
              description="Ranked by signal score. Counts are unique relevant discussions in sources collected for both weeks."
              actions={<ButtonLink href="/pain-points" size="sm">All pain points</ButtonLink>}
            />
            {pp.length ? (
              <PainPointTable rows={pp.slice(0, 8)} decisions={decisions} compact previousLabel={m.previous.label} />
            ) : (
              <CardBody>
                <EmptyState title="No pain points identified yet">
                  {m.totals.current.pending > 0 ? "Discussions are stored but not analysed yet. The next run (or Retry) analyses them." : "Nothing relevant has been classified for these two weeks."}
                </EmptyState>
              </CardBody>
            )}
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader title="Growing" description="≥ 2 more discussions and ≥ 25% vs last week" />
              <CardBody>
                <ChangeList items={growing} empty={m.quality.sufficientForTrend ? "Nothing grew meaningfully this week." : "Not enough data to call growth yet."} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="New this week" description="Not seen in the previous week — no % (zero baseline)" />
              <CardBody>
                <ChangeList items={emerging} empty="No new pain points this week." />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Fading" description="Declining, or seen last week but not this week" />
              <CardBody>
                <ChangeList items={declining} empty="Nothing declined meaningfully." />
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {hasData && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Still unresolved" description="Pain points where most of this week's discussions show no working fix (AI judgement per discussion, counted by code)." />
            <CardBody>
              {unresolved.length ? (
                <ul className="space-y-3">
                  {unresolved.map((p) => (
                    <li key={p.painPointId} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/pain-points/${p.painPointId}`} className="text-sm font-medium hover:underline">
                          {p.title}
                        </Link>
                        <p className="text-xs text-text-3">
                          {p.unresolvedCurrent} of {p.current} unresolved
                          {p.dissatisfiedCurrent > 0 && ` · ${p.dissatisfiedCurrent} criticise existing tools`}
                        </p>
                      </div>
                      <TrendBadge status={p.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-3">No pain point has 2+ discussions with a majority unresolved this week.</p>
              )}
              <Link href="/opportunities" className="mt-4 inline-block text-xs text-accent-text hover:underline">
                See opportunity hypotheses →
              </Link>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={
                <span className="inline-flex items-center gap-2">
                  Recommended next actions <AiBadge />
                </span>
              }
              description="From the brief. Click a source chip to verify the evidence."
            />
            <CardBody>
              {brief?.recommendations.length ? (
                <ol className="space-y-3">
                  {brief.recommendations.slice(0, 4).map((r, i) => (
                    <li key={i}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{r.title}</span>
                        <Badge>{r.kind}</Badge>
                        <Badge tone={r.priority === "now" ? "accent" : "neutral"}>{r.priority}</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-text-2">{r.rationale}</p>
                      <div className="mt-1">
                        <EvidenceChips ids={r.evidence} docs={evidence} max={2} />
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-text-3">Recommendations appear once a brief exists for this week.</p>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {hasData && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Discussion volume by week" description={`Unique discussions per reporting week (Fri–Thu ${TZ_LABEL}), by source. Hatched = week in progress.`} />
            <CardBody>
              <VolumeChart data={m.series} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Most discussed topics" description="Relevant discussions per topic, this week vs previous (comparable sources)." />
            <CardBody>
              {m.topics.some((t) => t.current + t.previous > 0) ? (
                <TopicCompareChart
                  data={m.topics.filter((t) => t.current + t.previous > 0).map((t) => ({ name: t.name, current: t.current, previous: t.previous }))}
                  currentLabel={m.current.label}
                  previousLabel={m.previous.label}
                />
              ) : (
                <p className="text-sm text-text-3">No relevant discussions classified yet.</p>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {hasData && (
        <Card>
          <CardHeader
            title="Sources and coverage"
            description={`Week-on-week comparisons use: ${m.comparableSources.map(sourceLabel).join(", ") || "none yet"}.`}
            actions={<ButtonLink href="/health" size="sm">Data health</ButtonLink>}
          />
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-3">
                  <th className="px-4 py-2 font-medium">Source</th>
                  <th className="px-4 py-2 text-right font-medium">This week</th>
                  <th className="px-4 py-2 text-right font-medium">Relevant</th>
                  <th className="px-4 py-2 text-right font-medium">Previous</th>
                  <th className="w-1/3 px-4 py-2 font-medium">Share of this week</th>
                </tr>
              </thead>
              <tbody>
                {m.sources.map((s) => (
                  <tr key={s.sourceId} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      <SourceBadge source={s.sourceId} />
                      {!m.comparableSources.includes(s.sourceId) && <span className="ml-2 text-xs text-warn">not in comparison</span>}
                    </td>
                    <td className="px-4 py-2 text-right">{s.current}</td>
                    <td className="px-4 py-2 text-right">{s.relevantCurrent}</td>
                    <td className="px-4 py-2 text-right text-text-2">
                      {s.previous} <span className="text-xs text-text-3">({fmtSigned(s.current - s.previous)})</span>
                    </td>
                    <td className="px-4 py-2">
                      <MiniBar value={s.current} max={maxSource} color={sourceColorVar(s.sourceId)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
