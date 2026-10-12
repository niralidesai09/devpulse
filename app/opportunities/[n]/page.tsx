// One opportunity from the latest brief, with a decision recorded on its underlying pain point.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DecisionForm } from "@/components/DecisionForm";
import { OpportunityBody } from "@/components/OpportunityDetail";
import { DECISION_LABEL } from "@/components/PainPointList";
import { AiLabel, Badge, Callout, ErrorPanel, PageHeader, Section, TrendBadge } from "@/components/ui";
import { isAdmin } from "@/lib/auth";
import { safeLoad } from "@/lib/db/safe";
import { loadOverview } from "@/lib/views/overview";

export const metadata: Metadata = { title: "Opportunity" };

export default async function OpportunityPage(props: PageProps<"/opportunities/[n]">) {
  await connection();
  const { n } = await props.params;
  const index = Number(n);
  if (!Number.isInteger(index) || index < 0) notFound();
  const [admin, loaded] = await Promise.all([isAdmin(), safeLoad(loadOverview)]);
  if (!loaded.ok) return <ErrorPanel title="Could not load this opportunity" error={loaded.error} />;
  const { report, evidence, metrics, decisions } = loaded.data;
  const o = report?.brief?.opportunities[index];
  if (!report || !o) notFound();
  const byId = new Map((report.metrics ?? metrics).painPoints.map((p) => [p.painPointId, p]));
  const pps = o.pain_points.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const primary = o.pain_points[0] ?? null;
  const decision = primary ? decisions.get(primary) : undefined;

  return (
    <div className="space-y-12">
      <PageHeader
        back={{ href: "/opportunities", label: "Opportunities" }}
        title={o.title}
        meta={
          <>
            <AiLabel>Hypothesis written by Gemini</AiLabel>
            <span>Confidence: {o.confidence}</span>
            <span>From the brief for {report.metrics.current.label}</span>
            {decision && <Badge tone="accent">Your decision: {DECISION_LABEL[decision.decision]}</Badge>}
          </>
        }
      />

      {pps.length > 0 && (
        <Section title="Based on" description="The pain points behind this opportunity, with this week’s numbers.">
          <ul className="divide-y divide-line border-y border-line">
            {pps.map((p) => (
              <li key={p.painPointId}>
                <Link href={`/pain-points/${p.painPointId}`} className="flex flex-wrap items-center justify-between gap-3 py-3.5 hover:text-accent-ink">
                  <span className="text-[14px] font-medium text-ink">{p.title}</span>
                  <span className="flex items-center gap-3 text-[13px] text-ink-3">
                    <span className="tabular">
                      {p.current} this week · {p.previous} last week
                    </span>
                    <TrendBadge status={p.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <OpportunityBody o={o} docs={evidence} />

      <Section title="Your decision" description={pps[0] ? `Saved on the underlying pain point “${pps[0].title}”, so it also shows on the Pain Points page.` : "This opportunity is not linked to a pain point."}>
        {!primary ? null : admin ? (
          <DecisionForm painPointId={primary} reportId={report.id} current={decision?.decision ?? null} />
        ) : (
          <Callout title="Sign in to record a decision">
            <Link href={`/login?next=/opportunities/${index}`} className="text-accent-ink hover:underline">
              Sign in
            </Link>{" "}
            to mark this as Investigate, Validate, Monitor or Dismiss.
          </Callout>
        )}
      </Section>
    </div>
  );
}
