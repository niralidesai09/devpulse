import Link from "next/link";
import type { PainPointMetric } from "@/lib/analytics/metrics";
import type { DecisionRow } from "@/lib/db/types";
import { fmtPct, fmtSigned } from "@/lib/format";
import { Badge, InfoTip, Sparkline, TrendBadge } from "./ui";

const DECISION_LABEL: Record<string, string> = {
  investigate: "Investigate",
  validate: "Validate",
  backlog: "Backlog",
  monitor: "Monitor",
  dismiss: "Dismissed",
};

export const SIGNAL_HELP =
  "Signal score (0–100, heuristic, not validated): 30% volume (log-scaled), 20% recurrence across the last 4 weeks, 15% source diversity, 15% unresolved share, 10% growth (damped), 10% criticism of existing tools. Engagement/popularity is deliberately excluded.";

export function PainPointTable({
  rows,
  decisions,
  compact = false,
  previousLabel,
}: {
  rows: PainPointMetric[];
  decisions?: Map<string, DecisionRow>;
  compact?: boolean;
  previousLabel?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-text-3">
            <th className="w-8 px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Pain point</th>
            <th className="px-3 py-2 text-right font-medium" title="Unique relevant discussions this week (comparable sources)">
              This wk
            </th>
            <th className="px-3 py-2 text-right font-medium" title={previousLabel ? `Previous week: ${previousLabel}` : "Previous week"}>
              Prev
            </th>
            <th className="px-3 py-2 text-right font-medium">Change</th>
            <th className="px-3 py-2 font-medium">Trend</th>
            {!compact && <th className="px-3 py-2 font-medium" title="Weekly counts over the last 4 complete weeks">4 wk</th>}
            {!compact && (
              <th className="px-3 py-2 text-right font-medium" title="Share of this week's discussions the AI judged unresolved">
                Unresolved
              </th>
            )}
            <th className="px-3 py-2 text-right font-medium">
              <span className="inline-flex items-center gap-1">
                Signal <InfoTip text={SIGNAL_HELP} />
              </span>
            </th>
          </tr>
        </thead>
        <tbody className="tabular">
          {rows.map((p) => {
            const d = decisions?.get(p.painPointId);
            return (
              <tr key={p.painPointId} className="border-b border-border last:border-0 hover:bg-surface-2/60">
                <td className="px-3 py-2.5 text-text-3">{p.rank}</td>
                <td className="max-w-[26rem] px-3 py-2.5">
                  <Link href={`/pain-points/${p.painPointId}`} className="font-medium text-text hover:underline">
                    {p.title}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-text-3">
                    {p.topicName && <span>{p.topicName}</span>}
                    {p.sourcesAll.length > 1 && <span>· {p.sourcesAll.length} sources</span>}
                    {d && <Badge tone="accent" wrap title={`PM decision: ${d.rationale ?? "no rationale"}`}>PM: {DECISION_LABEL[d.decision]}</Badge>}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-medium">{p.current}</td>
                <td className="px-3 py-2.5 text-right text-text-2">{p.previous}</td>
                <td className="px-3 py-2.5 text-right text-text-2" title={p.pctChange === null ? "No percentage: previous week was 0" : undefined}>
                  {fmtSigned(p.absChange)}
                  {p.pctChange !== null && p.status !== "insufficient_data" && <span className="ml-1 text-text-3">({fmtPct(p.pctChange)})</span>}
                </td>
                <td className="px-3 py-2.5">
                  <TrendBadge status={p.status} />
                </td>
                {!compact && (
                  <td className="px-3 py-2.5">
                    <Sparkline values={p.weekly} label={p.title} />
                  </td>
                )}
                {!compact && (
                  <td className="px-3 py-2.5 text-right text-text-2">
                    {p.current ? `${p.unresolvedCurrent}/${p.current}` : "—"}
                  </td>
                )}
                <td className="px-3 py-2.5 text-right font-medium">{p.signalScore}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
