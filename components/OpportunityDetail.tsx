// The body of one opportunity: observed facts first, then the hypothesis and how to test it.

import type { StoredBrief } from "@/lib/ai/brief";
import type { EvidenceDoc } from "@/lib/views/overview";
import { EvidenceLinks } from "./Evidence";
import { Badge } from "./ui";

type Opp = StoredBrief["opportunities"][number];

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <h3 className="text-[13px] font-medium text-ink-3">{label}</h3>
      <div className="mt-1 text-[15px] leading-6 text-ink">{children}</div>
    </div>
  );
}

export function OpportunityBody({ o, docs }: { o: Opp; docs: Map<string, EvidenceDoc> }) {
  return (
    <div className="space-y-12">
      <section aria-labelledby="observed">
        <h2 id="observed" className="mb-5 flex items-center gap-2 text-[15px] font-semibold text-ink">
          What the evidence shows <Badge>Observed</Badge>
        </h2>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <Block label="The developer problem">{o.problem_statement}</Block>
          <Block label="Evidence that current approaches fall short">{o.dissatisfaction_evidence}</Block>
          <Block label="Existing workaround or tool limitation">{o.existing_workaround || <span className="text-ink-3">None described in the discussions.</span>}</Block>
          <Block label="Who it affects">{o.persona || <span className="text-ink-3">The evidence does not support a specific persona.</span>}</Block>
        </div>
        <EvidenceLinks ids={o.evidence} docs={docs} max={6} label="Supporting discussions" />
      </section>

      <section aria-labelledby="hypothesis" className="rounded-[var(--radius-lg)] border border-line bg-panel p-6 sm:p-8">
        <h2 id="hypothesis" className="mb-5 flex items-center gap-2 text-[15px] font-semibold text-ink">
          The opportunity <Badge tone="accent">Hypothesis — needs validation</Badge>
        </h2>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <Block label="Why it matters for a code review automation product">{o.why_it_matters}</Block>
          <Block label="Proposed opportunity">{o.proposed_opportunity}</Block>
          <Block label="Falsifiable hypothesis">{o.hypothesis}</Block>
          <Block label="Evidence limitations">{o.limitations}</Block>
        </div>
      </section>

      <section aria-labelledby="validate">
        <h2 id="validate" className="mb-5 text-[15px] font-semibold text-ink">
          How to validate it
        </h2>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <Block label="Ask in a customer interview">“{o.validation_question}”</Block>
          <Block label="Run this experiment">{o.experiment}</Block>
          <Block label="It is confirmed if…">{o.success_criterion}</Block>
        </div>
      </section>
    </div>
  );
}
