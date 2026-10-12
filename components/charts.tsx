"use client";
// Trends charts. Every value comes from stored data passed in by the page.
// Validated two-colour pair: forest (--series-1) and ochre (--series-2).
// Each chart has a visible legend (when it has 2 series), value tooltips,
// readable category labels, and a "Show as table" view of the same numbers.

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { wrapWords } from "@/lib/format";

const tooltipStyle = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 6, fontSize: 12 },
  labelStyle: { color: "var(--ink)", fontWeight: 600 },
  itemStyle: { color: "var(--ink-2)" },
  cursor: { fill: "var(--surface-2)" },
};

/** Category label wrapped over as many lines as it needs: never truncated. */
function WrappedTick({ x, y, payload }: { x?: number | string; y?: number | string; payload?: { value: string } }) {
  if (!payload) return null;
  const lines = wrapWords(payload.value, 26);
  const x0 = Number(x) - 8;
  return (
    <text x={x0} y={Number(y)} textAnchor="end" fontSize={12} fill="var(--ink-2)">
      {lines.map((line, i) => (
        <tspan key={i} x={x0} dy={i === 0 ? -((lines.length - 1) * 14) / 2 + 4 : 14}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-4 text-[12px] text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-2.5 rounded-[2px]" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function TableView({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3 text-[12.5px]">
      <summary className="cursor-pointer text-ink-2 hover:text-ink">Show as table</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="tabular w-full text-left">
          <thead className="text-ink-3">
            <tr>
              {head.map((h, i) => (
                <th key={h} className={`py-1 pr-3 font-medium ${i ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r[0])} className="border-t border-line">
                {r.map((c, i) => (
                  <td key={i} className={`py-1 pr-3 ${i ? "text-right" : ""}`}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------
// 1. Relevant discussions per week (all sources). Needs ≥ 2 weekly points.
// ---------------------------------------------------------------------
export function WeeklyVolumeChart({ points }: { points: { week: string; kept: number }[] }) {
  return (
    <figure>
      <div style={{ height: 220 }} role="img" aria-label="Relevant discussions per week, all sources">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="week" tick={{ fill: "var(--ink-3)", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
            <YAxis allowDecimals={false} tick={{ fill: "var(--ink-3)", fontSize: 12 }} tickLine={false} axisLine={false} />
            <Tooltip {...tooltipStyle} cursor={{ stroke: "var(--line-strong)" }} formatter={(v) => [`${v} discussions`, "Relevant"]} />
            <Line type="linear" dataKey="kept" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 4, fill: "var(--series-1)" }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <TableView head={["Week ending", "Relevant discussions"]} rows={points.map((p) => [p.week, p.kept])} />
    </figure>
  );
}

// ---------------------------------------------------------------------
// 2. Mentions by topic for ONE week (used until weekly history exists).
// ---------------------------------------------------------------------
export function TopicVolumeChart({ data }: { data: { topic: string; mentions: number }[] }) {
  return (
    <figure>
      <div style={{ height: 24 + data.length * 44 }} role="img" aria-label="Relevant discussions by topic this week, all sources">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }} barCategoryGap="28%">
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="topic"
              width={180}
              tickLine={false}
              axisLine={false}
              interval={0}
              tick={<WrappedTick />}
            />
            <Tooltip {...tooltipStyle} formatter={(v) => [`${v} discussions`, "This week"]} />
            <Bar dataKey="mentions" fill="var(--series-1)" radius={[0, 3, 3, 0]} maxBarSize={16} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TableView head={["Topic", "Relevant discussions"]} rows={data.map((d) => [d.topic, d.mentions])} />
    </figure>
  );
}

// ---------------------------------------------------------------------
// 3. Resolved vs unresolved by topic (stacked).
// ---------------------------------------------------------------------
export function ResolutionChart({ data }: { data: { topic: string; unresolved: number; resolved: number }[] }) {
  return (
    <figure>
      <Legend
        items={[
          { label: "Unresolved", color: "var(--series-2)" },
          { label: "Resolved", color: "var(--series-1)" },
        ]}
      />
      <div style={{ height: 24 + data.length * 44 }} role="img" aria-label="Resolved and unresolved discussions by topic">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap="28%">
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="topic"
              width={180}
              tickLine={false}
              axisLine={false}
              interval={0}
              tick={<WrappedTick />}
            />
            <Tooltip {...tooltipStyle} formatter={(v, name) => [`${v} discussions`, name]} />
            {/* 2px surface gap between stacked segments */}
            <Bar dataKey="unresolved" name="Unresolved" stackId="s" fill="var(--series-2)" stroke="var(--surface)" strokeWidth={2} maxBarSize={16} isAnimationActive={false} />
            <Bar dataKey="resolved" name="Resolved" stackId="s" fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} radius={[0, 3, 3, 0]} maxBarSize={16} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TableView
        head={["Topic", "Unresolved", "Resolved", "Unresolved share"]}
        rows={data.map((d) => [d.topic, d.unresolved, d.resolved, `${d.unresolved + d.resolved ? Math.round((d.unresolved / (d.unresolved + d.resolved)) * 100) : 0}%`])}
      />
    </figure>
  );
}

// ---------------------------------------------------------------------
// 4. Source contribution: relevant vs collected per source (one measure each).
// ---------------------------------------------------------------------
export function SourceChart({ data }: { data: { source: string; relevant: number; collected: number }[] }) {
  return (
    <figure>
      <Legend
        items={[
          { label: "Relevant (kept)", color: "var(--series-1)" },
          { label: "Collected", color: "var(--series-2)" },
        ]}
      />
      <div style={{ height: 24 + data.length * 52 }} role="img" aria-label="Collected and relevant discussions by source">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barGap={2} barCategoryGap="30%">
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis type="category" dataKey="source" width={110} tickLine={false} axisLine={false} interval={0} tick={{ fill: "var(--ink-2)", fontSize: 12 }} />
            <Tooltip {...tooltipStyle} formatter={(v, name) => [`${v} discussions`, name]} />
            <Bar dataKey="relevant" name="Relevant (kept)" fill="var(--series-1)" radius={[0, 3, 3, 0]} maxBarSize={14} isAnimationActive={false} />
            <Bar dataKey="collected" name="Collected" fill="var(--series-2)" radius={[0, 3, 3, 0]} maxBarSize={14} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TableView
        head={["Source", "Relevant", "Collected", "Kept"]}
        rows={data.map((d) => [d.source, d.relevant, d.collected, `${d.collected ? Math.round((d.relevant / d.collected) * 100) : 0}%`])}
      />
    </figure>
  );
}
