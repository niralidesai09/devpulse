// Markdown export of a stored report. Links come from the database.

import type { Report } from "@/lib/db/reports";
import { fmtPct, fmtSigned, sourceLabel, TREND_LABELS } from "@/lib/format";

type Doc = { id: string; title: string; url: string; source_id: string };

export function reportToMarkdown(report: Report, docs: Map<string, Doc>, reportUrl: string | null): string {
  const m = report.metrics;
  const b = report.brief;
  const title = new Map(m.painPoints.map((p) => [p.painPointId, p.title]));
  const cite = (ids: string[]) =>
    ids
      .map((id) => docs.get(id))
      .filter((d): d is Doc => Boolean(d))
      .map((d) => `[${sourceLabel(d.source_id)}: ${d.title.replace(/[[\]]/g, "")}](${d.url})`)
      .join("; ");
  const L: string[] = [];
  L.push(`# Developer Community Pulse — ${m.current.label}`);
  L.push("");
  L.push(`Reporting week: ${m.current.label} (${m.timezone}) · previous week: ${m.previous.label}`);
  L.push(`Generated: ${report.completed_at ?? report.created_at} · model: ${report.model ?? "n/a"} · pipeline ${report.pipeline_version}`);
  if (reportUrl) L.push(`Online: ${reportUrl}`);
  L.push("");
  L.push(
    `**Data:** ${m.totals.current.unique} unique discussions this week (${m.totals.current.relevant} relevant, ${m.totals.current.painPoints} pain points); previous week ${m.totals.previous.unique} (${m.totals.previous.relevant} relevant).`,
  );
  L.push("");
  if (b) {
    L.push(`## Executive summary`, "", `**${b.headline}**`, "");
    for (const x of b.executive_summary) L.push(`- ${x.text} — ${cite(x.evidence)}`);
    L.push("");
    if (b.notable_changes.length) {
      L.push(`## Important changes since the previous week`, "");
      for (const x of b.notable_changes) L.push(`- ${x.text} — ${cite(x.evidence)}`);
      L.push("");
    }
  }
  L.push(`## Top pain points`, "", `| # | Pain point | This wk | Prev | Change | Trend | Signal |`, `|---|---|---:|---:|---:|---|---:|`);
  for (const p of m.painPoints.slice(0, 12)) {
    L.push(
      `| ${p.rank} | ${p.title.replace(/\|/g, "/")} | ${p.current} | ${p.previous} | ${fmtSigned(p.absChange)}${p.pctChange !== null ? ` (${fmtPct(p.pctChange)})` : ""} | ${TREND_LABELS[p.status]} | ${p.signalScore} |`,
    );
  }
  L.push("");
  const names = (ids: string[]) => ids.map((id) => title.get(id)).filter(Boolean).join(", ") || "—";
  L.push(`## Emerging and declining themes`, "");
  L.push(`- New: ${names(m.groups.new)}`, `- Growing: ${names(m.groups.growing)}`, `- Declining: ${names(m.groups.declining)}`, `- Not seen this week: ${names(m.groups.gone)}`, "");
  if (b) {
    if (b.pain_point_insights.length) {
      L.push(`## Pain point analysis`, "");
      for (const x of b.pain_point_insights) {
        L.push(`### ${title.get(x.pain_point) ?? "Pain point"}`, "");
        L.push(`- Likely impact: ${x.likely_impact}`);
        L.push(`- Existing tools: ${x.tools_assessment.replace("_", " ")} — ${x.tools_assessment_reason}`);
        L.push(`- Workaround described: ${x.workaround || "none"}`);
        L.push(`- Evidence: ${cite(x.evidence)}`, "");
      }
    }
    if (b.opportunities.length) {
      L.push(`## Unresolved problems and opportunity hypotheses`, "");
      for (const o of b.opportunities) {
        L.push(`### ${o.title} (confidence: ${o.confidence})`, "");
        L.push(`- Problem: ${o.problem_statement}`);
        if (o.persona) L.push(`- Persona: ${o.persona}`);
        L.push(`- Dissatisfaction evidence: ${o.dissatisfaction_evidence}`);
        L.push(`- Existing workaround: ${o.existing_workaround || "none described"}`);
        L.push(`- Why it matters: ${o.why_it_matters}`);
        L.push(`- Opportunity: ${o.proposed_opportunity}`);
        L.push(`- Hypothesis: ${o.hypothesis}`);
        L.push(`- Validation question: ${o.validation_question}`);
        L.push(`- Experiment: ${o.experiment}`);
        L.push(`- Success criterion: ${o.success_criterion}`);
        L.push(`- Limitations: ${o.limitations}`);
        L.push(`- Evidence: ${cite(o.evidence)}`, "");
      }
    }
    L.push(`## Recommendations`, "");
    b.recommendations.forEach((r, i) => L.push(`${i + 1}. **${r.title}** (${r.kind}, ${r.priority}) — ${r.rationale} — ${cite(r.evidence)}`));
    L.push("");
    L.push(`## Questions to validate with users`, "");
    for (const q of b.validation_questions) L.push(`- ${q.question}${q.pain_point ? ` _(${title.get(q.pain_point) ?? ""})_` : ""}`);
    L.push("");
  }
  L.push(`## Data coverage, caveats and confidence`, "");
  L.push(`- Comparable sources: ${m.comparableSources.map(sourceLabel).join(", ") || "none"}`);
  for (const e of m.excludedFromComparison) L.push(`- ${sourceLabel(e.sourceId)} excluded from comparison: ${e.reason}`);
  for (const w of m.quality.warnings) L.push(`- ${w}`);
  if (m.retrospective.note) L.push(`- ${m.retrospective.note}`);
  for (const c of b?.caveats ?? []) L.push(`- ${c} (AI-noted)`);
  L.push(`- Counts and trends are computed by code; narrative by ${report.model ?? "Gemini Flash"}. Opportunities are hypotheses, not validated findings.`);
  return L.join("\n");
}
