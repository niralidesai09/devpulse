import type { StoredBrief } from "@/lib/ai/brief";
import type { EvidenceDoc } from "@/lib/views/overview";
import { EvidenceChips } from "./Evidence";
import { AiBadge, Badge } from "./ui";

type Opp = StoredBrief["opportunities"][number];

function Field({ label, children, hypothesis = false }: { label: string; children: React.ReactNode; hypothesis?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium text-text-3">
        {label}
        {hypothesis && <span className="ml-1 font-normal italic">(hypothesis)</span>}
      </dt>
      <dd className="text-sm text-text-2">{children}</dd>
    </div>
  );
}

export function OpportunityCard({ o, docs, painPointTitles }: { o: Opp; docs: Map<string, EvidenceDoc>; painPointTitles: Map<string, string> }) {
  return (
    <article className="avoid-break rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{o.title}</h3>
        <AiBadge />
        <Badge tone={o.confidence === "high" ? "good" : o.confidence === "medium" ? "info" : "warn"} title="Model-stated confidence, constrained by the prompt rules — not a calibrated probability">
          confidence: {o.confidence}
        </Badge>
        <Badge tone="neutral">Hypothesis — needs validation</Badge>
      </div>
      <p className="mt-1 text-xs text-text-3">Pain points: {o.pain_points.map((id) => painPointTitles.get(id) ?? "unknown").join(", ") || "—"}</p>
      <dl className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="Observed problem">{o.problem_statement}</Field>
        <Field label="Evidence of dissatisfaction">{o.dissatisfaction_evidence}</Field>
        <Field label="Existing workaround">{o.existing_workaround || "None described in the evidence"}</Field>
        <Field label="Target persona">{o.persona || "Not supported by the evidence"}</Field>
        <Field label="Why it matters for code review automation">{o.why_it_matters}</Field>
        <Field label="Proposed opportunity" hypothesis>
          {o.proposed_opportunity}
        </Field>
        <Field label="Falsifiable hypothesis" hypothesis>
          {o.hypothesis}
        </Field>
        <Field label="Customer interview question">{o.validation_question}</Field>
        <Field label="Next experiment">{o.experiment}</Field>
        <Field label="Success criterion">{o.success_criterion}</Field>
        <Field label="Evidence limitations">{o.limitations}</Field>
      </dl>
      <div className="mt-3 border-t border-border pt-2">
        <span className="mr-2 text-xs text-text-3">Evidence:</span>
        <EvidenceChips ids={o.evidence} docs={docs} max={5} />
      </div>
    </article>
  );
}
