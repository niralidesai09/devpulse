// A stored weekly brief — exactly as generated, with evidence and data caveats.
// Print-friendly (browser print / Save as PDF) and exportable as Markdown/JSON.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { EvidenceChips } from "@/components/Evidence";
import { OpportunityCard } from "@/components/Opportunity";
import { PrintButton } from "@/components/PrintButton";
import { PainPointTable } from "@/components/PainPointTable";
import { AiBadge, Badge, buttonClass, Callout, Card, ErrorPanel, PageHeader, SourceBadge } from "@/components/ui";
import { getDiscussionsByIds } from "@/lib/db/discussions";
import { getReport, getReportEvidence } from "@/lib/db/reports";
import { safeLoad } from "@/lib/db/safe";
import { fmtDateTime, sourceLabel, TZ_LABEL } from "@/lib/format";

export const metadata: Metadata = { title: "Report" };

function Section({ n, title, ai, children }: { n: number; title: string; ai?: boolean; children: React.ReactNode }) {
  return (
    <section className="avoid-break">
      <h2 className="mb-2 flex items-center gap-2 text-base font-semibold">
        <span className="tabular text-text-3">{n}.</span> {title} {ai && <AiBadge />}
      </h2>
      {children}
    </section>
  );
}

export default async function ReportPage(props: PageProps<"/reports/[id]">) {
  await connection();
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const loaded = await safeLoad(async () => {
    const report = await getReport(id);
    if (!report) return null;
    const ev = await getReportEvidence(id);
    const docs = new Map((await getDiscussionsByIds([...new Set(ev.map((e) => e.discussion_id))])).map((d) => [d.id, d]));
    return { report, docs, evidenceCount: new Set(ev.map((e) => e.discussion_id)).size };
  });
  if (!loaded.ok) return <ErrorPanel title="Could not load this report" error={loaded.error} />;
  if (!loaded.data) notFound();
  const { report, docs, evidenceCount } = loaded.data;
  const m = report.metrics;
  const b = report.brief;
  const titles = new Map(m.painPoints.map((p) => [p.painPointId, p.title]));
  const names = (ids: string[]) => ids.map((x) => titles.get(x)).filter(Boolean) as string[];
  const v = report.validation;

  return (
    <article className="space-y-8">
      <PageHeader
        eyebrow={
          <span className="no-print">
            <Link href="/reports" className="hover:underline">
              ← Reports
            </Link>
          </span>
        }
        title={`Developer Community Pulse — ${m.current.label}`}
        description={
          <>
            Week {m.current.label} vs {m.previous.label} ({TZ_LABEL}, Fri–Thu). Generated {fmtDateTime(report.completed_at ?? report.created_at)} · {report.trigger} ·
            model {report.model ?? "—"} · prompt {report.prompt_version ?? "—"} · pipeline {report.pipeline_version}.
          </>
        }
        actions={
          <>
            <PrintButton />
            <a className={buttonClass("secondary", "sm")} href={`/api/reports/${id}/export?format=md`}>
              Export Markdown
            </a>
            <a className={buttonClass("ghost", "sm")} href={`/api/reports/${id}/export?format=json`}>
              JSON
            </a>
          </>
        }
      />

      {report.status === "failed" && (
        <Callout tone="bad" title="The AI brief could not be generated for this report">
          {report.error} The deterministic numbers below were computed and saved; generate a new brief once the issue is resolved.
        </Callout>
      )}
      {report.status === "generating" && <Callout tone="info">This brief is still being generated.</Callout>}
      {report.email_status === "sent" && <p className="no-print text-xs text-text-3">Emailed {fmtDateTime(report.emailed_at)} (provider id {report.email_provider_id}).</p>}
      {report.email_status === "failed" && <p className="no-print text-xs text-bad">Email delivery failed: {report.email_error}</p>}

      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        {[
          ["Unique discussions", m.totals.current.unique, m.totals.previous.unique],
          ["Relevant", m.totals.current.relevant, m.totals.previous.relevant],
          ["Pain points", m.totals.current.painPoints, m.totals.previous.painPoints],
          ["Cited discussions", evidenceCount, null],
        ].map(([label, cur, prev]) => (
          <div key={String(label)} className="rounded-lg border border-border bg-surface px-3 py-2">
            <p className="text-xs text-text-3">{label}</p>
            <p className="tabular text-xl font-semibold">{cur}</p>
            {prev !== null && <p className="tabular text-xs text-text-3">previous week {prev}</p>}
          </div>
        ))}
      </div>

      {b && (
        <Section n={1} title="Executive summary" ai>
          <p className="mb-2 text-[15px] font-medium">{b.headline}</p>
          <ul className="space-y-2">
            {b.executive_summary.map((x, i) => (
              <li key={i} className="text-sm text-text-2">
                {x.text}
                <div className="mt-1">
                  <EvidenceChips ids={x.evidence} docs={docs} />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section n={2} title="Important changes since the previous week" ai={Boolean(b?.notable_changes.length)}>
        {b?.notable_changes.length ? (
          <ul className="space-y-2">
            {b.notable_changes.map((x, i) => (
              <li key={i} className="text-sm text-text-2">
                {x.text}
                <div className="mt-1">
                  <EvidenceChips ids={x.evidence} docs={docs} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-3">{m.quality.sufficientForTrend ? "No notable changes were identified." : "Not enough comparable data to describe changes reliably this week."}</p>
        )}
      </Section>

      <Section n={3} title="Top developer pain points">
        <Card>
          <PainPointTable rows={m.painPoints.slice(0, 12)} previousLabel={m.previous.label} />
        </Card>
        {b && b.pain_point_insights.length > 0 && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {b.pain_point_insights.map((x) => (
              <div key={x.pain_point} className="avoid-break rounded-lg border border-border bg-surface p-3 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  <Link href={`/pain-points/${x.pain_point}`} className="hover:underline">
                    {titles.get(x.pain_point) ?? "Pain point"}
                  </Link>
                  <AiBadge />
                </p>
                <p className="mt-1 text-text-2">
                  <span className="text-text-3">Impact:</span> {x.likely_impact}
                </p>
                <p className="mt-1 text-text-2">
                  <span className="text-text-3">Existing tools:</span> <Badge>{x.tools_assessment.replace("_", " ")}</Badge> {x.tools_assessment_reason}
                </p>
                <p className="mt-1 text-text-2">
                  <span className="text-text-3">Workaround:</span> {x.workaround || "none described"}
                </p>
                <div className="mt-1.5">
                  <EvidenceChips ids={x.evidence} docs={docs} max={2} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section n={4} title="Emerging and declining themes">
        <div className="grid gap-3 text-sm md:grid-cols-4">
          {[
            ["New", m.groups.new],
            ["Growing", m.groups.growing],
            ["Declining", m.groups.declining],
            ["Not seen this week", m.groups.gone],
          ].map(([label, ids]) => (
            <div key={label as string} className="rounded-lg border border-border bg-surface p-3">
              <p className="text-xs font-medium text-text-3">{label as string}</p>
              <ul className="mt-1 space-y-1 text-text-2">
                {names(ids as string[]).length ? names(ids as string[]).map((n) => <li key={n}>{n}</li>) : <li className="text-text-3">None</li>}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-text-3">Computed by code: “growing/declining” require ≥ 2 discussions and ≥ 25% change with at least 4 discussions across both weeks.</p>
      </Section>

      <Section n={5} title="Unresolved problems and opportunity areas" ai={Boolean(b?.opportunities.length)}>
        {b?.opportunities.length ? (
          <div className="space-y-3">
            {b.opportunities.map((o, i) => (
              <OpportunityCard key={i} o={o} docs={docs} painPointTitles={titles} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-3">No opportunity met the evidence bar this week.</p>
        )}
      </Section>

      <Section n={6} title="Supporting discussions">
        <ul className="space-y-1.5 text-sm">
          {[...docs.values()].slice(0, 40).map((d) => (
            <li key={d.id} className="flex flex-wrap items-baseline gap-x-2">
              <SourceBadge source={d.source_id} />
              <a href={d.url} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">
                {d.title}
              </a>
              {d.is_excluded && <span className="text-xs text-warn">(excluded later)</span>}
            </li>
          ))}
        </ul>
      </Section>

      {b && (
        <Section n={7} title="Product recommendations" ai>
          <ol className="space-y-3">
            {b.recommendations.filter((r) => r.kind !== "engineering").map((r, i) => (
              <li key={i} className="text-sm">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {r.title} <Badge>{r.kind}</Badge> <Badge tone={r.priority === "now" ? "accent" : "neutral"}>{r.priority}</Badge>
                </p>
                <p className="text-text-2">{r.rationale}</p>
                <div className="mt-1">
                  <EvidenceChips ids={r.evidence} docs={docs} />
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {b && (
        <Section n={8} title="Suggested engineering priorities" ai>
          {b.recommendations.some((r) => r.kind === "engineering") ? (
            <ol className="space-y-3">
              {b.recommendations.filter((r) => r.kind === "engineering").map((r, i) => (
                <li key={i} className="text-sm">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {r.title} <Badge tone={r.priority === "now" ? "accent" : "neutral"}>{r.priority}</Badge>
                  </p>
                  <p className="text-text-2">{r.rationale}</p>
                  <div className="mt-1">
                    <EvidenceChips ids={r.evidence} docs={docs} />
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-text-3">No engineering-specific priority this week.</p>
          )}
        </Section>
      )}

      {b && (
        <Section n={9} title="Questions to validate with users" ai>
          <ul className="list-disc space-y-1 pl-5 text-sm text-text-2">
            {b.validation_questions.map((q, i) => (
              <li key={i}>
                {q.question} {q.pain_point && <span className="text-xs text-text-3">({titles.get(q.pain_point)})</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section n={10} title="Data coverage, caveats and confidence">
        <ul className="list-disc space-y-1 pl-5 text-sm text-text-2">
          <li>Week-on-week comparison uses: {m.comparableSources.map(sourceLabel).join(", ") || "no sources"}.</li>
          {m.excludedFromComparison.map((e) => (
            <li key={e.sourceId}>
              {sourceLabel(e.sourceId)} not compared: {e.reason}.
            </li>
          ))}
          {m.quality.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
          {m.retrospective.note && <li>{m.retrospective.note}</li>}
          {(b?.caveats ?? []).map((c) => (
            <li key={c}>
              {c} <span className="text-xs text-text-3">(noted by the model)</span>
            </li>
          ))}
          <li>Counts, changes and scores are computed by code from stored records; narrative is Gemini Flash output validated against a schema and its citations.</li>
          {v && (v.droppedItems?.length || v.removedReferences || v.numericWarnings?.length) ? (
            <li>
              Grounding checks: {v.removedReferences ?? 0} invalid reference(s) removed; {v.droppedItems?.length ?? 0} unsupported item(s) dropped
              {v.numericWarnings?.length ? `; ${v.numericWarnings.length} number(s) in the text could not be matched to computed values: ${v.numericWarnings.slice(0, 3).join(" | ")}` : ""}.
            </li>
          ) : null}
        </ul>
      </Section>
    </article>
  );
}
