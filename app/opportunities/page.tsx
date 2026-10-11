import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { OpportunityCard } from "@/components/Opportunity";
import { Callout, EmptyState, ErrorPanel, PageHeader } from "@/components/ui";
import { safeLoad } from "@/lib/db/safe";
import { fmtDateTime } from "@/lib/format";
import { loadOverview } from "@/lib/views/overview";

export const metadata: Metadata = { title: "Opportunities" };

export default async function OpportunitiesPage() {
  await connection();
  const loaded = await safeLoad(loadOverview);
  if (!loaded.ok) return <ErrorPanel title="Could not load opportunities" error={loaded.error} />;
  const { report, evidence, metrics } = loaded.data;
  const opps = report?.brief?.opportunities ?? [];
  const titles = new Map((report?.metrics ?? metrics).painPoints.map((p) => [p.painPointId, p.title]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Underserved opportunity hypotheses"
        description={
          <>
            Problems where the evidence shows more than frequency — unresolved questions, failed workarounds, or complaints about existing tools.
            Each is a <strong>hypothesis to validate</strong>, with an interview question, an experiment and a success criterion.
            {report && (
              <>
                {" "}
                From the brief for {report.metrics.current.label} (generated {fmtDateTime(report.completed_at)}) —{" "}
                <Link href={`/reports/${report.id}`} className="text-accent-text hover:underline">
                  open report
                </Link>
                .
              </>
            )}
          </>
        }
      />
      <Callout tone="info" title="How to read this">
        Observed facts (problem, dissatisfaction, workaround) come from cited discussions. Proposed opportunity and hypothesis are the model&apos;s
        suggestions. A frequent problem is not automatically underserved — check the evidence chips before acting.
      </Callout>
      {opps.length ? (
        opps.map((o, i) => <OpportunityCard key={i} o={o} docs={evidence} painPointTitles={titles} />)
      ) : (
        <EmptyState title="No opportunity hypotheses yet">
          {report ? "The latest brief did not find an opportunity that met the evidence bar." : "Opportunities are written as part of the weekly brief. Generate a brief first."}
        </EmptyState>
      )}
    </div>
  );
}
