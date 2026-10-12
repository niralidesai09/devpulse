// One weekly brief, exactly as saved — laid out as a readable document.

import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { EvidenceLinks, evidenceLabel } from "@/components/Evidence";
import { PrintButton } from "@/components/PrintButton";
import { AiLabel, Badge, buttonClass, Callout, ErrorPanel, PageHeader, SourceLink, SourceTag, TrendBadge } from "@/components/ui";
import { getDiscussionsByIds } from "@/lib/db/discussions";
import { getReport, getReportEvidence } from "@/lib/db/reports";
import { safeLoad } from "@/lib/db/safe";
import { fmtDateTime, sourceLabel, TZ_LABEL } from "@/lib/format";

export const metadata: Metadata = { title: "Weekly Brief" };

function Part({ n, title, ai, note, children }: { n: number; title: string; ai?: boolean; note?: string; children: ReactNode }) {
  return (
    <section className="avoid-break grid gap-4 border-t border-line pt-8 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-10">
      <div>
        <p className="tabular text-[12px] font-medium text-ink-3">{String(n).padStart(2, "0")}</p>
        <h2 className="mt-1 text-[16px] leading-6 font-semibold text-ink">{title}</h2>
        {ai && (
          <div className="mt-1.5">
            <AiLabel>AI-written</AiLabel>
          </div>
        )}
        {note && <p className="mt-1.5 text-[12px] leading-[18px] text-ink-3">{note}</p>}
      </div>
      <div className="min-w-0">{children}</div>
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
    return { report, docs };
  });
  if (!loaded.ok) return <ErrorPanel title="Could not load this brief" error={loaded.error} />;
  if (!loaded.data) notFound();
  const { report, docs } = loaded.data;
  const m = report.metrics;
  const b = report.brief;
  const titles = new Map(m.painPoints.map((p) => [p.painPointId, p.title]));
  const byId = new Map(m.painPoints.map((p) => [p.painPointId, p]));
  const list = (ids: string[]) => ids.map((x) => byId.get(x)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const product = b?.recommendations.filter((r) => r.kind !== "engineering") ?? [];
  const engineering = b?.recommendations.filter((r) => r.kind === "engineering") ?? [];
  const v = report.validation;

  return (
    <article>
      <PageHeader
        back={{ href: "/reports", label: "Weekly Briefs" }}
        title={`Developer Pulse — week of ${m.current.label}`}
        meta={
          <>
            <span>
              Compared with {m.previous.label} · Fri–Thu {TZ_LABEL}
            </span>
            <span>Generated {fmtDateTime(report.completed_at ?? report.created_at)}</span>
            <span>
              {report.model ?? "—"} · {report.prompt_version ?? "—"}
            </span>
            {report.email_status === "sent" && <span>Emailed {fmtDateTime(report.emailed_at)}</span>}
          </>
        }
        actions={
          <>
            <PrintButton />
            <a className={buttonClass("secondary", "sm")} href={`/api/reports/${id}/export?format=md`}>
              <Download className="size-4" aria-hidden /> Markdown
            </a>
            <a className={buttonClass("ghost", "sm")} href={`/api/reports/${id}/export?format=json`}>
              JSON
            </a>
          </>
        }
      />

      {report.status === "failed" && (
        <div className="mb-8">
          <Callout tone="bad" title="The AI summary could not be written for this brief">
            {report.error} The numbers below were calculated and saved; a new brief can be generated once the issue is fixed.
          </Callout>
        </div>
      )}
      {report.email_status === "failed" && <p className="no-print mb-6 text-[13px] text-bad">Email delivery failed: {report.email_error}</p>}

      <div className="mb-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
        {[
          ["Relevant discussions", m.totals.current.relevant, m.totals.previous.relevant],
          ["Collected", m.totals.current.unique, m.totals.previous.unique],
          ["Distinct pain points", m.totals.current.painPoints, m.totals.previous.painPoints],
          ["Discussions cited", docs.size, null],
        ].map(([label, cur, prev]) => (
          <div key={String(label)}>
            <p className="text-[12px] text-ink-3">{label}</p>
            <p className="tabular text-[24px] leading-8 font-semibold text-ink">{cur}</p>
            {prev !== null && <p className="tabular text-[12px] text-ink-3">{prev} the week before</p>}
          </div>
        ))}
      </div>

      <div className="space-y-10">
        {b && (
          <Part n={1} title="Executive summary" ai>
            <p className="max-w-[44rem] text-[20px] leading-[30px] font-semibold tracking-[-0.01em] text-ink">{b.headline}</p>
            <ul className="mt-5 grid max-w-[44rem] gap-5">
              {b.executive_summary.map((x, i) => (
                <li key={i} className="text-[15px] leading-[25px] text-ink-2">
                  {x.text}
                  <EvidenceLinks ids={x.evidence} docs={docs} max={2} />
                </li>
              ))}
            </ul>
          </Part>
        )}

        <Part n={2} title="Most important pain points" note="Ranked by priority. Counts from sources collected in full for both weeks.">
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[520px] text-left text-[14px]">
              <thead>
                <tr className="border-b border-line text-[12px] text-ink-3">
                  <th className="w-8 py-2 font-medium">#</th>
                  <th className="py-2 font-medium">Problem</th>
                  <th className="py-2 text-right font-medium">This week</th>
                  <th className="py-2 text-right font-medium">Last week</th>
                  <th className="py-2 pl-4 font-medium">Trend</th>
                </tr>
              </thead>
              <tbody>
                {m.painPoints.slice(0, 8).map((p) => (
                  <tr key={p.painPointId} className="border-b border-line last:border-0">
                    <td className="py-2.5 text-ink-3">{p.rank}</td>
                    <td className="py-2.5 pr-4">
                      <Link href={`/pain-points/${p.painPointId}`} className="text-ink hover:text-accent-ink">
                        {p.title}
                      </Link>
                    </td>
                    <td className="py-2.5 text-right font-medium text-ink">{p.current}</td>
                    <td className="py-2.5 text-right text-ink-2">{p.previous}</td>
                    <td className="py-2.5 pl-4">
                      <TrendBadge status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {b && b.pain_point_insights.length > 0 && (
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              {b.pain_point_insights.map((x) => (
                <div key={x.pain_point} className="avoid-break">
                  <p className="text-[14px] font-semibold text-ink">{titles.get(x.pain_point) ?? "Pain point"}</p>
                  <p className="mt-1 text-[14px] leading-[22px] text-ink-2">{x.likely_impact}</p>
                  <p className="mt-1.5 text-[13px] text-ink-3">
                    Existing tools: {x.tools_assessment.replace("_", " ")} — {x.tools_assessment_reason}
                  </p>
                  {x.workaround && <p className="mt-1 text-[13px] text-ink-3">Workaround: {x.workaround}</p>}
                </div>
              ))}
            </div>
          )}
        </Part>

        <Part n={3} title="Changes since last week" ai={Boolean(b?.notable_changes.length)}>
          {b?.notable_changes.length ? (
            <ul className="grid max-w-[44rem] gap-4">
              {b.notable_changes.map((x, i) => (
                <li key={i} className="text-[15px] leading-[25px] text-ink-2">
                  {x.text}
                  <EvidenceLinks ids={x.evidence} docs={docs} max={2} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-ink-3">{m.quality.sufficientForTrend ? "No notable changes this week." : "Too little comparable data to describe changes reliably this week."}</p>
          )}
        </Part>

        <Part n={4} title="Emerging and declining themes" note="Calculated: “growing” and “declining” need a move of at least 2 discussions and 25%.">
          <div className="grid gap-6 sm:grid-cols-2">
            {(
              [
                ["Emerging", [...list(m.groups.new), ...list(m.groups.growing)]],
                ["Declining or gone", [...list(m.groups.declining), ...list(m.groups.gone)]],
              ] as const
            ).map(([label, items]) => (
              <div key={label}>
                <p className="text-[13px] font-medium text-ink-3">{label}</p>
                {items.length ? (
                  <ul className="mt-2 grid gap-2">
                    {items.slice(0, 8).map((p) => (
                      <li key={p.painPointId} className="flex items-start justify-between gap-3 text-[14px]">
                        <span className="text-ink">{p.title}</span>
                        <span className="tabular shrink-0 text-[12px] text-ink-3">
                          {p.previous} → {p.current}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[14px] text-ink-3">None</p>
                )}
              </div>
            ))}
          </div>
        </Part>

        <Part n={5} title="Underserved opportunities" ai={Boolean(b?.opportunities.length)} note="Hypotheses to validate — not findings.">
          {b?.opportunities.length ? (
            <ul className="grid gap-8">
              {b.opportunities.map((o, i) => (
                <li key={i} className="avoid-break">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[15px] font-semibold text-ink">{o.title}</p>
                    <Badge tone="accent">Hypothesis</Badge>
                    <span className="text-[12px] text-ink-3">confidence {o.confidence}</span>
                  </div>
                  <dl className="mt-2 grid gap-2 text-[14px] leading-[22px]">
                    <div>
                      <dt className="inline text-ink-3">Problem: </dt>
                      <dd className="inline text-ink-2">{o.problem_statement}</dd>
                    </div>
                    <div>
                      <dt className="inline text-ink-3">Opportunity: </dt>
                      <dd className="inline text-ink-2">{o.proposed_opportunity}</dd>
                    </div>
                    <div>
                      <dt className="inline text-ink-3">Test it: </dt>
                      <dd className="inline text-ink-2">
                        {o.experiment} Success if {o.success_criterion.charAt(0).toLowerCase() + o.success_criterion.slice(1)}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-ink-3">Limitations: </dt>
                      <dd className="inline text-ink-2">{o.limitations}</dd>
                    </div>
                  </dl>
                  <EvidenceLinks ids={o.evidence} docs={docs} max={2} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-ink-3">No opportunity met the evidence bar this week.</p>
          )}
        </Part>

        {b && (
          <Part n={6} title="Recommended product actions" ai>
            <ol className="grid max-w-[44rem] gap-5">
              {product.map((r, i) => (
                <li key={i}>
                  <p className="text-[15px] font-semibold text-ink">
                    {r.title} <span className="text-[12px] font-normal text-ink-3">· {r.priority === "now" ? "do now" : r.priority === "next" ? "do next" : "later"} · {r.kind}</span>
                  </p>
                  <p className="mt-1 text-[14px] leading-[22px] text-ink-2">{r.rationale}</p>
                  <EvidenceLinks ids={r.evidence} docs={docs} max={2} />
                </li>
              ))}
              {product.length === 0 && <li className="text-[14px] text-ink-3">None this week.</li>}
            </ol>
          </Part>
        )}

        {b && (
          <Part n={7} title="Suggested engineering priorities" ai>
            {engineering.length ? (
              <ol className="grid max-w-[44rem] gap-5">
                {engineering.map((r, i) => (
                  <li key={i}>
                    <p className="text-[15px] font-semibold text-ink">{r.title}</p>
                    <p className="mt-1 text-[14px] leading-[22px] text-ink-2">{r.rationale}</p>
                    <EvidenceLinks ids={r.evidence} docs={docs} max={2} />
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[14px] text-ink-3">No engineering-specific priority this week.</p>
            )}
          </Part>
        )}

        {b && (
          <Part n={8} title="Questions to ask customers" ai>
            <ul className="grid max-w-[44rem] list-disc gap-2 pl-5 text-[15px] leading-6 text-ink-2">
              {b.validation_questions.map((q, i) => (
                <li key={i}>
                  “{q.question}” {q.pain_point && <span className="text-[12px] text-ink-3">— {titles.get(q.pain_point)}</span>}
                </li>
              ))}
            </ul>
          </Part>
        )}

        <Part n={9} title="Supporting evidence" note={`${docs.size} discussions cited in this brief. Links open the originals.`}>
          <ul className="grid gap-2">
            {[...docs.values()].slice(0, 40).map((d) => (
              <li key={d.id} className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[14px]">
                <SourceLink href={d.url} className="min-w-0 text-ink">
                  {evidenceLabel(d)}
                </SourceLink>
                <SourceTag source={d.source_id} />
                {d.is_excluded && <span className="text-[12px] text-up">excluded later</span>}
              </li>
            ))}
          </ul>
        </Part>

        <Part n={10} title="Data coverage and limitations">
          <ul className="grid max-w-[44rem] list-disc gap-1.5 pl-5 text-[14px] leading-[22px] text-ink-2">
            <li>Week-on-week comparison uses {m.comparableSources.map(sourceLabel).join(" and ") || "no sources"} — the sources collected in full for both weeks.</li>
            {m.excludedFromComparison.map((e) => (
              <li key={e.sourceId}>
                {sourceLabel(e.sourceId)} is not compared: {e.reason}.
              </li>
            ))}
            {m.retrospective.note && <li>{m.retrospective.note}</li>}
            {m.quality.warnings
              .filter((w) => !w.startsWith("Week-on-week changes use only"))
              .map((w) => (
                <li key={w}>{w}</li>
              ))}
            {(b?.caveats ?? []).map((c) => (
              <li key={c}>
                {c} <span className="text-[12px] text-ink-3">(noted by the model)</span>
              </li>
            ))}
            <li>Counts, changes and priorities are calculated from stored discussions. The summary is Gemini Flash output, checked against a schema and its citations.</li>
            {v && (v.droppedItems?.length || v.removedReferences || v.numericWarnings?.length) ? (
              <li>
                Grounding checks: {v.removedReferences ?? 0} invalid reference(s) removed, {v.droppedItems?.length ?? 0} unsupported item(s) dropped
                {v.numericWarnings?.length ? `, ${v.numericWarnings.length} figure(s) in the text not matched to calculated values (often numbers quoted from the posts themselves)` : ""}.
              </li>
            ) : null}
          </ul>
        </Part>
      </div>
    </article>
  );
}
