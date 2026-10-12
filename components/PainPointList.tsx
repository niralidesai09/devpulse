// Scannable list of pain points: problem first, then evidence, frequency, trend, status.

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { PainPointMetric } from "@/lib/analytics/metrics";
import type { DecisionRow } from "@/lib/db/types";
import { Badge, EvidenceMeter, TrendBadge } from "./ui";

export const DECISION_LABEL: Record<string, string> = {
  investigate: "Investigating",
  validate: "Validating",
  backlog: "In backlog",
  monitor: "Monitoring",
  dismiss: "Dismissed",
};

export const PRIORITY_HELP =
  "Priority (0–100) is a transparent rule, not a validated model: 30% how many discussions (log-scaled), 20% how many of the last 4 weeks it appeared in, 15% how many different sources, 15% share still unresolved, 10% growth vs last week (damped for small numbers), 10% share criticising existing tools. Popularity (upvotes) is deliberately excluded.";

function change(p: PainPointMetric) {
  if (p.status === "new") return "not seen last week";
  if (p.status === "gone") return `${p.previous} last week, none this week`;
  if (p.absChange === 0) return "same as last week";
  return `${p.absChange > 0 ? "+" : "−"}${Math.abs(p.absChange)} vs last week${p.pctChange !== null && p.status !== "insufficient_data" ? ` (${p.pctChange > 0 ? "+" : ""}${p.pctChange}%)` : ""}`;
}

export function PainPointList({
  rows,
  descriptions,
  decisions,
}: {
  rows: PainPointMetric[];
  descriptions: Map<string, string>;
  decisions?: Map<string, DecisionRow>;
}) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {rows.map((p) => {
        const d = decisions?.get(p.painPointId);
        return (
          <li key={p.painPointId}>
            <Link href={`/pain-points/${p.painPointId}`} className="group grid gap-3 py-5 md:grid-cols-[minmax(0,1fr)_9.5rem_16.5rem] md:items-center md:gap-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[15px] leading-[22px] font-semibold text-ink transition-colors group-hover:text-accent-ink">{p.title}</p>
                  {d && (
                    <Badge tone="accent" title={d.rationale ?? "Your decision"}>
                      {DECISION_LABEL[d.decision]}
                    </Badge>
                  )}
                </div>
                {descriptions.get(p.painPointId) && <p className="mt-1 line-clamp-1 text-[14px] text-ink-2">{descriptions.get(p.painPointId)}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-3">
                  {p.topicName && <span>{p.topicName}</span>}
                  <EvidenceMeter discussions={p.current + p.previous} sources={p.sourcesAll.length} />
                  {p.current > 0 && p.unresolvedCurrent > 0 && (
                    <span>
                      {p.unresolvedCurrent} of {p.current} unresolved
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 md:block">
                <p className="tabular text-[15px] font-semibold text-ink">
                  {p.current} <span className="text-[13px] font-normal text-ink-3">this week</span>
                </p>
                <p className="tabular text-[12px] text-ink-3">{change(p)}</p>
              </div>
              <div className="flex items-center justify-between gap-4 md:justify-end">
                <TrendBadge status={p.status} />
                <span className="tabular w-16 text-right text-[12px] text-ink-3" title="Priority score — see “How priority is calculated” below">
                  priority <span className="font-semibold text-ink-2">{p.signalScore}</span>
                </span>
                <ArrowRight aria-hidden className="hidden size-4 text-ink-3 transition-colors group-hover:text-accent-ink md:block" />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
