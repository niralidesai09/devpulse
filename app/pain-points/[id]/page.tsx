// One pain point: deterministic numbers, the AI's interpretation (labelled),
// the evidence graph (recommendation → pain point → discussions → source URL)
// and the PM's decision log (human, never AI).

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { DecisionForm } from "@/components/DecisionForm";
import { AiBadge, Badge, ButtonLink, Callout, Card, CardBody, CardHeader, ErrorPanel, PageHeader, SourceBadge, SourceLink, Sparkline, Stat, TrendBadge } from "@/components/ui";
import { isAdmin } from "@/lib/auth";
import { getPainPoint, listDecisions, listPainPointDiscussions } from "@/lib/db/painPoints";
import { reportsCitingPainPoint } from "@/lib/db/reports";
import { safeLoad } from "@/lib/db/safe";
import { listTopics } from "@/lib/db/config";
import { fmtDate, fmtDateTime, fmtPct, fmtSigned, TREND_HELP } from "@/lib/format";
import { loadOverview } from "@/lib/views/overview";

export const metadata: Metadata = { title: "Pain point" };

const DECISION_LABEL: Record<string, string> = {
  investigate: "Investigate",
  validate: "Validate with users",
  backlog: "Add to backlog",
  monitor: "Monitor",
  dismiss: "Dismiss",
};

async function load(id: string) {
  const pp = await getPainPoint(id);
  if (!pp) return null;
  if (pp.merged_into) return { mergedInto: pp.merged_into } as const;
  const [overview, discussions, decisions, history, topics] = await Promise.all([
    loadOverview(),
    listPainPointDiscussions(id),
    listDecisions(id),
    reportsCitingPainPoint(id),
    listTopics({ includeArchived: true }),
  ]);
  return { pp, overview, discussions, decisions, history, topicName: topics.find((t) => t.id === pp.topic_id)?.name ?? null };
}

export default async function PainPointPage(props: PageProps<"/pain-points/[id]">) {
  await connection();
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [admin, loaded] = await Promise.all([isAdmin(), safeLoad(() => load(id))]);
  if (!loaded.ok) return <ErrorPanel title="Could not load this pain point" error={loaded.error} />;
  if (!loaded.data) notFound();
  if ("mergedInto" in loaded.data) redirect(`/pain-points/${loaded.data.mergedInto}`);
  const { pp, overview, discussions, decisions, history, topicName } = loaded.data;
  const m = overview.metrics;
  const metric = m.painPoints.find((p) => p.painPointId === id) ?? null;
  const report = overview.report;
  const insight = report?.brief?.pain_point_insights.find((x) => x.pain_point === id) ?? null;
  const recs = (report?.brief?.recommendations ?? []).filter((r) => r.pain_points.includes(id));
  const opps = (report?.brief?.opportunities ?? []).filter((o) => o.pain_points.includes(id));
  const live = discussions.filter((d) => !d.discussion.is_excluded);
  const workarounds = live.filter((d) => d.workaround).slice(0, 5);
  const toolCounts = new Map<string, number>();
  for (const d of live) for (const t of d.tools_mentioned) toolCounts.set(t, (toolCounts.get(t) ?? 0) + 1);
  const tools = [...toolCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const first = live.length ? live[live.length - 1].discussion.published_at : null;
  const last = live.length ? live[0].discussion.published_at : null;
  const sources = new Set(live.map((d) => d.discussion.source_id));
  const evidenceStrength =
    live.length >= 6 && sources.size >= 2 ? "Strong" : live.length >= 3 ? "Moderate" : "Weak";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link href="/pain-points" className="hover:underline">
            ← Pain points
          </Link>
        }
        title={pp.title}
        description={
          <>
            {pp.description} <span className="text-text-3">(canonical description written by Gemini Flash when the group was created{topicName ? ` · topic: ${topicName}` : ""})</span>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="This week" value={<span className="tabular">{metric?.current ?? 0}</span>} sub={m.current.label} hint="Unique relevant discussions this reporting week (comparable sources)." />
        <Stat
          label="Previous week"
          value={<span className="tabular">{metric?.previous ?? 0}</span>}
          sub={metric ? `${fmtSigned(metric.absChange)}${metric.pctChange !== null ? ` (${fmtPct(metric.pctChange)})` : " · no % (zero baseline)"}` : m.previous.label}
        />
        <Stat label="All-time supporting discussions" value={<span className="tabular">{live.length}</span>} sub={`${sources.size} source${sources.size === 1 ? "" : "s"} · first ${fmtDate(first)} · last ${fmtDate(last)}`} />
        <Stat
          label="Evidence strength"
          hint="Strong: 6+ discussions from 2+ sources. Moderate: 3+. Weak: fewer. A simple rule, not a calibrated probability."
          value={evidenceStrength}
          sub={metric ? <span className="inline-flex items-center gap-2">signal {metric.signalScore}/100 <TrendBadge status={metric.status} /></span> : "not active in the last two weeks"}
        />
      </div>

      {metric && (
        <Card>
          <CardHeader title="Weekly trend" description={TREND_HELP[metric.status]} />
          <CardBody className="flex flex-wrap items-center gap-6">
            <Sparkline values={metric.weekly} label={pp.title} />
            <p className="tabular text-sm text-text-2">Last 4 complete weeks: {metric.weekly.join(" → ")} · unresolved this week: {metric.unresolvedCurrent}/{metric.current} · criticising existing tools: {metric.dissatisfiedCurrent}/{metric.current}</p>
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={<span className="inline-flex items-center gap-2">Analysis <AiBadge /></span>}
            description={insight ? `From the brief for ${report!.metrics.current.label}.` : "Appears when this pain point is covered by a generated brief."}
          />
          <CardBody className="space-y-3 text-sm">
            {insight ? (
              <>
                <div>
                  <p className="text-xs font-medium text-text-3">Likely impact</p>
                  <p className="text-text-2">{insight.likely_impact}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-text-3">Do existing tools address it?</p>
                  <p className="text-text-2">
                    <Badge tone={insight.tools_assessment === "not_addressed" ? "warn" : "neutral"}>{insight.tools_assessment.replace("_", " ")}</Badge> {insight.tools_assessment_reason}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-text-3">Workaround described by developers</p>
                  <p className="text-text-2">{insight.workaround || "None described in the evidence."}</p>
                </div>
              </>
            ) : (
              <p className="text-text-3">No AI analysis for this pain point in the latest brief.</p>
            )}
            {opps.map((o, i) => (
              <div key={i} className="rounded-md border border-border bg-surface-2 p-3">
                <p className="text-xs font-medium text-text-3">Opportunity hypothesis · confidence {o.confidence}</p>
                <p className="font-medium">{o.title}</p>
                <p className="mt-1 text-text-2">{o.proposed_opportunity}</p>
                <Link href="/opportunities" className="mt-1 inline-block text-xs text-accent-text hover:underline">
                  Validation plan →
                </Link>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Product decision" description="Your decisions are stored separately from AI suggestions and kept as a history." />
          <CardBody className="space-y-4">
            {admin ? (
              <DecisionForm painPointId={id} reportId={report?.id ?? null} />
            ) : (
              <Callout tone="info">
                <Link href={`/login?next=/pain-points/${id}`} className="text-accent-text hover:underline">
                  Sign in
                </Link>{" "}
                to record a decision.
              </Callout>
            )}
            {decisions.length > 0 ? (
              <ol className="space-y-2 border-t border-border pt-3">
                {decisions.map((d) => (
                  <li key={d.id} className="text-sm">
                    <span className="font-medium">{DECISION_LABEL[d.decision]}</span>
                    <span className="text-xs text-text-3"> · {fmtDateTime(d.created_at)} · by {d.decided_by}</span>
                    {d.rationale && <p className="text-text-2">{d.rationale}</p>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-text-3">No decision recorded yet.</p>
            )}
          </CardBody>
        </Card>
      </div>

      {(recs.length > 0 || history.length > 0) && (
        <Card>
          <CardHeader title="Evidence graph" description="Recommendation → this pain point → supporting discussions → original sources. Follow any link to verify." />
          <CardBody className="space-y-3 text-sm">
            {recs.map((r, i) => (
              <div key={i}>
                <p>
                  <Badge tone="accent">AI recommendation</Badge> <span className="font-medium">{r.title}</span>
                </p>
                <p className="mt-0.5 text-xs text-text-2">
                  cites {r.evidence.length} discussion{r.evidence.length === 1 ? "" : "s"}:{" "}
                  {r.evidence
                    .map((eid) => live.find((d) => d.discussion.id === eid)?.discussion)
                    .filter(Boolean)
                    .map((d, j) => (
                      <span key={d!.id}>
                        {j > 0 && " · "}
                        <SourceLink href={d!.url}>{d!.title.slice(0, 60)}</SourceLink>
                      </span>
                    ))}
                </p>
              </div>
            ))}
            {history.length > 0 && (
              <p className="text-xs text-text-3">
                Appeared in {history.length} saved report{history.length === 1 ? "" : "s"}:{" "}
                {history.map((h, j) => (
                  <span key={h.report_id}>
                    {j > 0 && ", "}
                    <Link href={`/reports/${h.report_id}`} className="hover:underline">
                      {fmtDate(h.report.period_start)}–{fmtDate(h.report.period_end)} (rank {h.rank}, {h.current_count} disc.)
                    </Link>
                  </span>
                ))}
              </p>
            )}
          </CardBody>
        </Card>
      )}

      {(workarounds.length > 0 || tools.length > 0) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Workarounds developers describe" description="Extracted per discussion by the model; open the source to read it in context." />
            <CardBody>
              {workarounds.length ? (
                <ul className="space-y-2 text-sm">
                  {workarounds.map((w) => (
                    <li key={w.discussion.id}>
                      <p className="text-text-2">{w.workaround}</p>
                      <SourceLink href={w.discussion.url} className="text-xs text-text-3">
                        {w.discussion.title.slice(0, 80)}
                      </SourceLink>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-3">No workaround described.</p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Tools named in these discussions" description="Count of discussions naming each tool." />
            <CardBody>
              {tools.length ? (
                <ul className="tabular flex flex-wrap gap-1.5 text-xs">
                  {tools.map(([t, n]) => (
                    <li key={t}>
                      <Badge>
                        {t} · {n}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-3">No tools named.</p>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader title={`Supporting discussions (${live.length})`} description="What the author wrote (title, verified quote) is shown separately from the model's paraphrase." actions={<ButtonLink href={`/discussions?painPoint=${id}&status=relevant`} size="sm">Open in explorer</ButtonLink>} />
        <ul className="divide-y divide-border">
          {live.slice(0, 40).map((d) => (
            <li key={d.discussion.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-3">
                <SourceBadge source={d.discussion.source_id} />
                <span>{fmtDate(d.discussion.published_at, { year: true })}</span>
                {d.is_unresolved && <Badge tone="warn">unresolved</Badge>}
                {d.tool_dissatisfaction && <Badge>criticises a tool</Badge>}
              </div>
              <SourceLink href={d.discussion.url} className="mt-1 block text-sm font-medium text-text">
                {d.discussion.title}
              </SourceLink>
              {d.evidence_quote && d.quote_verified && (
                <blockquote className="mt-1 border-l-2 border-border-strong pl-2 text-sm text-text-2">“{d.evidence_quote}”</blockquote>
              )}
              {d.problem_summary && (
                <p className="mt-1 text-xs text-text-3">
                  <span className="font-medium text-accent-text">AI paraphrase:</span> {d.problem_summary}{" "}
                  <Link href={`/discussions/${d.discussion.id}`} className="hover:underline">
                    reasoning →
                  </Link>
                </p>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
