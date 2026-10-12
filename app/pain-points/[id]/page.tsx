// One pain point, read top to bottom:
//   Problem → Evidence → Frequency & trend → Product implication → Next step
// Author text, AI interpretation and the PM's own decisions are kept visibly apart.

import { ArrowRight, Quote } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { DecisionForm } from "@/components/DecisionForm";
import { DECISION_LABEL } from "@/components/PainPointList";
import {
  AiLabel,
  Badge,
  ButtonLink,
  Callout,
  Divider,
  ErrorPanel,
  EvidenceMeter,
  evidenceStrength,
  Metric,
  PageHeader,
  Panel,
  Section,
  SourceLink,
  SourceTag,
  Sparkline,
  TrendBadge,
} from "@/components/ui";
import { isAdmin } from "@/lib/auth";
import { listTopics } from "@/lib/db/config";
import { getPainPoint, listDecisions, listPainPointDiscussions } from "@/lib/db/painPoints";
import { reportsCitingPainPoint } from "@/lib/db/reports";
import { safeLoad } from "@/lib/db/safe";
import { fmtDate, fmtDateTime, fmtPeriod, sourceLabel, TREND_HELP } from "@/lib/format";
import { loadOverview } from "@/lib/views/overview";

export const metadata: Metadata = { title: "Pain point" };

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
  const brief = report?.brief ?? null;
  const insight = brief?.pain_point_insights.find((x) => x.pain_point === id) ?? null;
  const recs = (brief?.recommendations ?? []).filter((r) => r.pain_points.includes(id));
  const opps = (brief?.opportunities ?? []).map((o, i) => ({ o, i })).filter(({ o }) => o.pain_points.includes(id));
  const questions = (brief?.validation_questions ?? []).filter((q) => q.pain_point === id);

  const live = discussions.filter((d) => !d.discussion.is_excluded);
  const sources = [...new Set(live.map((d) => d.discussion.source_id))];
  const first = live.length ? live[live.length - 1].discussion.published_at : null;
  const last = live.length ? live[0].discussion.published_at : null;
  const quotes = live.filter((d) => d.evidence_quote && d.quote_verified).slice(0, 3);
  const workarounds = live.filter((d) => d.workaround).slice(0, 4);
  const toolCounts = new Map<string, number>();
  for (const d of live) for (const t of d.tools_mentioned) toolCounts.set(t, (toolCounts.get(t) ?? 0) + 1);
  const tools = [...toolCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const unresolved = live.filter((d) => d.is_unresolved).length;
  const strength = evidenceStrength(live.length, sources.length);
  const latestDecision = decisions[0] ?? null;

  return (
    <div className="space-y-14">
      {/* Problem */}
      <PageHeader
        back={{ href: "/pain-points", label: "Pain Points" }}
        title={pp.title}
        description={pp.description}
        meta={
          <>
            {topicName && <span>{topicName}</span>}
            {metric && <TrendBadge status={metric.status} />}
            <EvidenceMeter discussions={live.length} sources={sources.length} />
            <span>
              First observed {fmtDate(first, { year: true })} · most recent {fmtDate(last, { year: true })}
            </span>
            {latestDecision && <Badge tone="accent">Your decision: {DECISION_LABEL[latestDecision.decision]}</Badge>}
          </>
        }
      />

      {/* Evidence */}
      <Section title="What developers are saying" description="Verbatim quotes, checked word-for-word against the original posts.">
        {quotes.length ? (
          <ul className="grid gap-4 md:grid-cols-3">
            {quotes.map((q) => (
              <li key={q.discussion.id}>
                <Panel className="flex h-full flex-col p-5">
                  <Quote aria-hidden className="size-4 text-line-strong" />
                  <blockquote className="mt-2 flex-1 text-[15px] leading-6 text-ink">“{q.evidence_quote}”</blockquote>
                  <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
                    <SourceTag source={q.discussion.source_id} />
                    <span>{fmtDate(q.discussion.published_at)}</span>
                    <SourceLink href={q.discussion.url} className="text-ink-2">
                      Original
                    </SourceLink>
                  </div>
                </Panel>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-ink-3">No verified quote is available; see the supporting discussions below.</p>
        )}
      </Section>

      {/* Frequency & trend */}
      <Section title="How often, and is it changing?" description={metric ? TREND_HELP[metric.status] : "Not discussed in the last two weeks."}>
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-4 lg:divide-x lg:divide-line">
          <Metric
            emphasis
            label="This week"
            value={metric?.current ?? 0}
            explanation={`Unique discussions, ${m.current.label}. Counted from ${m.comparableSources.map(sourceLabel).join(" and ") || "comparable sources"}.`}
          />
          <div className="lg:pl-8">
            <Metric label="Last week" value={metric?.previous ?? 0} explanation={m.previous.label} />
          </div>
          <div className="lg:pl-8">
            <Metric
              label="Change"
              value={metric ? `${metric.absChange > 0 ? "+" : metric.absChange < 0 ? "−" : ""}${Math.abs(metric.absChange)}` : "—"}
              comparison={
                metric?.pctChange !== null && metric?.pctChange !== undefined && metric.status !== "insufficient_data" ? (
                  <span className="tabular">{metric.pctChange > 0 ? "+" : ""}{metric.pctChange}%</span>
                ) : (
                  <span>No percentage{metric?.previous === 0 ? " — zero last week" : " — too few to compare"}</span>
                )
              }
              explanation="Discussions, this week minus last week."
            />
          </div>
          <div className="lg:pl-8">
            <div className="text-[13px] font-medium text-ink-2">Last 4 weeks</div>
            <div className="mt-3">{metric ? <Sparkline values={metric.weekly} label={pp.title} /> : <span className="text-ink-3">—</span>}</div>
            <p className="tabular mt-2 text-[12px] text-ink-3">{metric ? metric.weekly.join(" → ") : ""} · all time: {live.length} from {sources.length} source{sources.length === 1 ? "" : "s"}</p>
          </div>
        </div>
      </Section>

      {/* Product implication */}
      <Section
        title="What it means for the product"
        description={insight ? `From the brief for ${report!.metrics.current.label}.` : "Appears once a weekly brief covers this pain point."}
        actions={insight ? <AiLabel>AI analysis</AiLabel> : undefined}
      >
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div>
            <h3 className="text-[13px] font-medium text-ink-3">Likely impact on teams</h3>
            <p className="mt-1 text-[14px] leading-[22px] text-ink-2">{insight?.likely_impact ?? "No AI analysis yet."}</p>
          </div>
          <div>
            <h3 className="text-[13px] font-medium text-ink-3">Do existing tools solve it?</h3>
            {insight ? (
              <p className="mt-1 text-[14px] leading-[22px] text-ink-2">
                <Badge tone={insight.tools_assessment === "not_addressed" ? "up" : "neutral"}>{insight.tools_assessment.replace("_", " ")}</Badge> {insight.tools_assessment_reason}
              </p>
            ) : (
              <p className="mt-1 text-[14px] text-ink-3">—</p>
            )}
            {tools.length > 0 && (
              <p className="mt-2 text-[12px] text-ink-3">
                Tools named: {tools.map(([t, n]) => `${t} (${n})`).join(", ")}
              </p>
            )}
          </div>
          <div>
            <h3 className="text-[13px] font-medium text-ink-3">Workarounds developers describe</h3>
            {workarounds.length ? (
              <ul className="mt-1 grid gap-2 text-[14px] leading-[22px] text-ink-2">
                {workarounds.map((w) => (
                  <li key={w.discussion.id}>
                    {w.workaround}{" "}
                    <SourceLink href={w.discussion.url} className="text-[12px] text-ink-3">
                      source
                    </SourceLink>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[14px] text-ink-3">None described in the discussions.</p>
            )}
          </div>
        </div>
        {opps.length > 0 && (
          <div className="mt-6 grid gap-2">
            {opps.map(({ o, i }) => (
              <Link key={i} href={`/opportunities/${i}`} className="group flex items-center justify-between gap-4 rounded-[var(--radius)] border border-line bg-panel px-4 py-3 hover:border-line-strong">
                <span className="min-w-0">
                  <span className="text-[12px] text-ink-3">Opportunity hypothesis</span>
                  <span className="block truncate text-[14px] font-medium text-ink group-hover:text-accent-ink">{o.title}</span>
                </span>
                <ArrowRight aria-hidden className="size-4 shrink-0 text-ink-3" />
              </Link>
            ))}
          </div>
        )}
      </Section>

      {/* Next step */}
      <Section title="Next step" description="Your decision is stored separately from AI suggestions and kept as a history.">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
          <div className="min-w-0">
            {admin ? (
              <DecisionForm painPointId={id} reportId={report?.id ?? null} current={latestDecision?.decision ?? null} />
            ) : (
              <Callout title="Sign in to record a decision">
                <Link href={`/login?next=/pain-points/${id}`} className="text-accent-ink hover:underline">
                  Sign in
                </Link>{" "}
                to mark this problem as Investigate, Validate, Backlog, Monitor or Dismiss.
              </Callout>
            )}
            {decisions.length > 0 && (
              <ol className="mt-6 grid gap-3 border-t border-line pt-4">
                {decisions.map((d) => (
                  <li key={d.id} className="text-[13px]">
                    <span className="font-medium text-ink">{DECISION_LABEL[d.decision]}</span>
                    <span className="text-ink-3"> · {fmtDateTime(d.created_at)}</span>
                    {d.rationale && <p className="text-ink-2">{d.rationale}</p>}
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="min-w-0 space-y-6">
            <div>
              <h3 className="text-[13px] font-medium text-ink-3">Ask customers</h3>
              {questions.length ? (
                <ul className="mt-1.5 grid gap-2 text-[14px] leading-[22px] text-ink">
                  {questions.map((q) => (
                    <li key={q.question}>“{q.question}”</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-[14px] text-ink-3">No interview question suggested for this problem yet.</p>
              )}
            </div>
            {recs.length > 0 && (
              <div>
                <h3 className="text-[13px] font-medium text-ink-3">Recommended in the brief</h3>
                <ul className="mt-1.5 grid gap-1.5 text-[14px] text-ink">
                  {recs.map((r) => (
                    <li key={r.title}>
                      {r.title} <span className="text-[12px] text-ink-3">· cites {r.evidence.length} discussion{r.evidence.length === 1 ? "" : "s"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <h3 className="text-[13px] font-medium text-ink-3">Evidence limitations</h3>
              <p className="mt-1 text-[13px] leading-5 text-ink-2">
                {strength} evidence: {live.length} discussion{live.length === 1 ? "" : "s"} from {sources.length} source{sources.length === 1 ? "" : "s"}
                {unresolved ? `, ${unresolved} judged unresolved` : ""}. Grouping and “unresolved” are AI judgements — open a discussion to check its reasoning.
              </p>
            </div>
          </div>
        </div>
      </Section>

      <Divider />

      {/* Full evidence */}
      <Section
        title={`All supporting discussions (${live.length})`}
        description="Title and quote are the author’s words; the paraphrase is Gemini’s reading of it."
        actions={<ButtonLink href={`/discussions?painPoint=${id}&status=relevant`} size="sm" variant="ghost">Open in Discussions <ArrowRight className="size-3.5" aria-hidden /></ButtonLink>}
      >
        <ul className="divide-y divide-line border-y border-line">
          {live.slice(0, 40).map((d) => (
            <li key={d.discussion.id} className="py-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
                <SourceTag source={d.discussion.source_id} />
                <span>{fmtDate(d.discussion.published_at, { year: true })}</span>
                {d.is_unresolved && <Badge tone="up">Unresolved</Badge>}
                {d.tool_dissatisfaction && <Badge>Criticises a tool</Badge>}
              </div>
              <SourceLink href={d.discussion.url} className="mt-1 block text-[14px] font-medium text-ink">
                {d.discussion.title}
              </SourceLink>
              {d.problem_summary && (
                <p className="mt-1 text-[13px] text-ink-2">
                  <span className="text-accent-ink">Gemini’s reading:</span> {d.problem_summary}{" "}
                  <Link href={`/discussions/${d.discussion.id}`} className="text-ink-3 hover:text-ink">
                    Why?
                  </Link>
                </p>
              )}
            </li>
          ))}
        </ul>
        {history.length > 0 && (
          <p className="mt-4 text-[13px] text-ink-3">
            Appeared in {history.length} saved brief{history.length === 1 ? "" : "s"}:{" "}
            {history.map((h, j) => (
              <span key={h.report_id}>
                {j > 0 && ", "}
                <Link href={`/reports/${h.report_id}`} className="text-ink-2 hover:text-accent-ink">
                  {fmtPeriod(h.report.period_start, h.report.period_end)} (#{h.rank})
                </Link>
              </span>
            ))}
          </p>
        )}
      </Section>
    </div>
  );
}
