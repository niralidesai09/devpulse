import type { Metadata } from "next";
import { connection } from "next/server";
import { PainPointTable, SIGNAL_HELP } from "@/components/PainPointTable";
import { Callout, Card, CardHeader, CardBody, EmptyState, ErrorPanel, PageHeader } from "@/components/ui";
import { SIGNAL_WEIGHTS } from "@/lib/analytics/metrics";
import { safeLoad } from "@/lib/db/safe";
import { TZ_LABEL } from "@/lib/format";
import { loadOverview } from "@/lib/views/overview";

export const metadata: Metadata = { title: "Pain points" };

export default async function PainPointsPage() {
  await connection();
  const loaded = await safeLoad(loadOverview);
  if (!loaded.ok) return <ErrorPanel title="Could not load pain points" error={loaded.error} />;
  const { metrics: m, decisions } = loaded.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Week ${m.current.label} vs ${m.previous.label} (${TZ_LABEL})`}
        title="Pain point intelligence"
        description="Canonical developer problems, grouped semantically by Gemini Flash so that different wordings of the same problem count once. All counts, changes and scores are computed by code from stored discussions."
      />
      {!m.quality.sufficientForTrend && (
        <Callout tone="warn" title="Small sample">
          {m.quality.warnings[m.quality.warnings.length - 1]}
        </Callout>
      )}
      <Card>
        <CardHeader title={`${m.painPoints.length} pain points active in the last two weeks`} description="Click a pain point for its evidence, AI analysis and your decision log." />
        {m.painPoints.length ? (
          <PainPointTable rows={m.painPoints} decisions={decisions} previousLabel={m.previous.label} />
        ) : (
          <CardBody>
            <EmptyState title="No pain points yet">Run a collection; pain points appear once discussions are analysed.</EmptyState>
          </CardBody>
        )}
      </Card>
      <Card>
        <CardHeader title="How the signal score works" description="A transparent heuristic to separate signal from noise — not a validated statistical model." />
        <CardBody className="space-y-2 text-sm text-text-2">
          <p>{SIGNAL_HELP}</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {Object.entries(SIGNAL_WEIGHTS).map(([k, w]) => (
              <li key={k} className="tabular">
                <span className="text-text">{Math.round(w * 100)}%</span> {k}
              </li>
            ))}
          </ul>
          <p className="text-xs text-text-3">
            Trend labels need at least 4 discussions across both weeks and a move of ≥ 2 discussions and ≥ 25%. When the previous week is 0 no percentage is shown.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
