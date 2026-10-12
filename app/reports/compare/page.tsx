// Compare two saved reports using their stored snapshots (report_pain_points),
// never regenerated history: which pain points appeared, disappeared, grew,
// declined or changed topic/classification between the two briefs.

import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Badge, EmptyState, ErrorPanel, PageHeader, Section } from "@/components/ui";
import { getReport, getReportPainPoints, type ReportPainPointRow } from "@/lib/db/reports";
import { safeLoad } from "@/lib/db/safe";
import { fmtDateTime, fmtSigned, TREND_LABELS } from "@/lib/format";
import type { TrendStatus } from "@/lib/analytics/metrics";

export const metadata: Metadata = { title: "Compare reports" };

type Change = { title: string; id: string; a: ReportPainPointRow | null; b: ReportPainPointRow | null; kind: "appeared" | "disappeared" | "grew" | "declined" | "unchanged" | "reclassified" };

export default async function ComparePage(props: PageProps<"/reports/compare">) {
  await connection();
  const sp = await props.searchParams;
  const a = typeof sp.a === "string" ? sp.a : "";
  const b = typeof sp.b === "string" ? sp.b : "";
  if (!/^[0-9a-f-]{36}$/i.test(a) || !/^[0-9a-f-]{36}$/i.test(b)) {
    return <EmptyState title="Choose two reports to compare">Go to Reports and pick two saved briefs.</EmptyState>;
  }
  const loaded = await safeLoad(async () => {
    const [ra, rb, pa, pb] = await Promise.all([getReport(a), getReport(b), getReportPainPoints(a), getReportPainPoints(b)]);
    return { ra, rb, pa, pb };
  });
  if (!loaded.ok) return <ErrorPanel title="Could not compare" error={loaded.error} />;
  const { ra, rb, pa, pb } = loaded.data;
  if (!ra || !rb) return <EmptyState title="Report not found">One of the selected reports no longer exists.</EmptyState>;

  const ma = new Map(pa.map((r) => [r.pain_point_id, r]));
  const mb = new Map(pb.map((r) => [r.pain_point_id, r]));
  const ids = [...new Set([...ma.keys(), ...mb.keys()])];
  const changes: Change[] = ids.map((id) => {
    const x = ma.get(id) ?? null;
    const y = mb.get(id) ?? null;
    const ca = x?.current_count ?? 0;
    const cb = y?.current_count ?? 0;
    const kind: Change["kind"] =
      !x || ca === 0 ? (cb > 0 ? "appeared" : "unchanged")
      : !y || cb === 0 ? "disappeared"
      : x.topic_id !== y.topic_id ? "reclassified"
      : cb > ca ? "grew"
      : cb < ca ? "declined"
      : "unchanged";
    return { id, title: y?.title ?? x?.title ?? "Unknown", a: x, b: y, kind };
  });
  const order: Change["kind"][] = ["appeared", "grew", "reclassified", "declined", "disappeared", "unchanged"];
  changes.sort((p, q) => order.indexOf(p.kind) - order.indexOf(q.kind) || (q.b?.current_count ?? 0) - (p.b?.current_count ?? 0));
  const counts = Object.fromEntries(order.map((k) => [k, changes.filter((c) => c.kind === k).length]));
  const tone = { appeared: "accent", grew: "up", reclassified: "neutral", declined: "down", disappeared: "neutral", unchanged: "neutral" } as const;

  return (
    <div className="space-y-10">
      <PageHeader
        back={{ href: "/reports", label: "Weekly Briefs" }}
        title="Compare briefs"
        description={
          <>
            <strong>A:</strong> {ra.metrics.current.label} (generated {fmtDateTime(ra.completed_at)}) → <strong>B:</strong> {rb.metrics.current.label} (generated {fmtDateTime(rb.completed_at)}). Uses the numbers saved with each report.
          </>
        }
      />
      {a === b && <EmptyState title="Same report selected twice">Pick two different reports to see changes.</EmptyState>}
      <div className="flex flex-wrap gap-2 text-[12px]">
        {order.map((k) => (
          <Badge key={k} tone={tone[k]}>
            {k}: {counts[k]}
          </Badge>
        ))}
      </div>
      <Section title="Pain points across the two briefs" description="Counts are each brief’s “this week” discussions for that pain point.">
        <div className="overflow-x-auto">
          <table className="tabular w-full min-w-[640px] text-left text-[14px]">
            <thead>
              <tr className="border-b border-line text-[12px] text-ink-3">
                <th className="px-3 py-2.5 font-medium">Pain point</th>
                <th className="px-3 py-2.5 font-medium">Change</th>
                <th className="px-3 py-2.5 text-right font-medium">A</th>
                <th className="px-3 py-2.5 text-right font-medium">B</th>
                <th className="px-3 py-2.5 text-right font-medium">Δ</th>
                <th className="px-3 py-2.5 font-medium">Rank A → B</th>
                <th className="px-3 py-2.5 font-medium">Trend in B</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2.5">
                    <Link href={`/pain-points/${c.id}`} className="hover:underline">
                      {c.title}
                    </Link>
                    {c.kind === "reclassified" && (
                      <p className="text-[12px] text-ink-3">
                        topic: {c.a?.topic_name ?? "—"} → {c.b?.topic_name ?? "—"}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge tone={tone[c.kind]}>{c.kind}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-right">{c.a?.current_count ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right">{c.b?.current_count ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right">{fmtSigned((c.b?.current_count ?? 0) - (c.a?.current_count ?? 0))}</td>
                  <td className="px-3 py-2.5 text-ink-2">
                    {c.a?.rank ?? "—"} → {c.b?.rank ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-ink-2">{c.b ? TREND_LABELS[c.b.trend_status as TrendStatus] : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
