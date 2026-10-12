// Opportunities — product hypotheses from the latest weekly brief.

import { ArrowRight, Lightbulb } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { DECISION_LABEL } from "@/components/PainPointList";
import { AiLabel, Badge, Callout, EmptyState, ErrorPanel, PageHeader, Section, TrendBadge } from "@/components/ui";
import { safeLoad } from "@/lib/db/safe";
import { fmtDateTime } from "@/lib/format";
import { loadOverview } from "@/lib/views/overview";

export const metadata: Metadata = { title: "Opportunities" };

export default async function OpportunitiesPage() {
  await connection();
  const loaded = await safeLoad(loadOverview);
  if (!loaded.ok) return <ErrorPanel title="Could not load opportunities" error={loaded.error} />;
  const { report, metrics, decisions } = loaded.data;
  const opps = report?.brief?.opportunities ?? [];
  const byId = new Map((report?.metrics ?? metrics).painPoints.map((p) => [p.painPointId, p]));

  return (
    <div className="space-y-10">
      <PageHeader
        title="Opportunities"
        description="Product hypotheses worth validating — problems where developers show more than frequency: unresolved questions, failed workarounds or complaints about existing tools."
        meta={
          report ? (
            <>
              <span>From the brief for {report.metrics.current.label}</span>
              <span>Generated {fmtDateTime(report.completed_at)}</span>
              <AiLabel>Written by Gemini, grounded in cited discussions</AiLabel>
            </>
          ) : undefined
        }
      />

      <Callout title="These are hypotheses, not findings">
        A frequent problem is not automatically an underserved market. Each opportunity separates what the evidence shows from what is proposed, and
        ends with a concrete way to test it.
      </Callout>

      {opps.length ? (
        <Section title={`${opps.length} opportunit${opps.length === 1 ? "y" : "ies"} this week`}>
          <ul className="divide-y divide-line border-y border-line">
            {opps.map((o, i) => {
              const pps = o.pain_points.map((id) => byId.get(id)).filter(Boolean);
              const discussions = pps.reduce((n, p) => n + (p?.current ?? 0), 0);
              const d = o.pain_points.map((id) => decisions.get(id)).find(Boolean);
              return (
                <li key={i}>
                  <Link href={`/opportunities/${i}`} className="group grid gap-3 py-6 md:grid-cols-[minmax(0,1fr)_auto] md:gap-8">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Lightbulb aria-hidden className="size-4 text-ink-3" />
                        <p className="text-[16px] leading-6 font-semibold text-ink group-hover:text-accent-ink">{o.title}</p>
                        {d && <Badge tone="accent">{DECISION_LABEL[d.decision]}</Badge>}
                      </div>
                      <p className="mt-1.5 line-clamp-2 max-w-3xl text-[14px] leading-[22px] text-ink-2">{o.problem_statement}</p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ink-3">
                        <span className="tabular">
                          {discussions} discussion{discussions === 1 ? "" : "s"} this week · {o.evidence.length} cited
                        </span>
                        {pps[0] && <TrendBadge status={pps[0].status} />}
                        <span>Confidence: {o.confidence}</span>
                      </div>
                    </div>
                    <span className="hidden items-center gap-1 self-center text-[13px] font-medium text-ink-3 group-hover:text-accent-ink md:inline-flex">
                      Open <ArrowRight className="size-3.5" aria-hidden />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : (
        <EmptyState icon={<Lightbulb className="size-8" strokeWidth={1.5} aria-hidden />} title="No opportunity hypotheses yet">
          {report ? "The latest brief did not find an opportunity that met the evidence bar." : "Opportunities are written as part of the weekly brief. Generate the first brief to see them here."}
        </EmptyState>
      )}
    </div>
  );
}
