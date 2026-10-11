"use client";

// Charts. Rules (docs/DESIGN.md → Data visualisation):
//   * one y-axis per chart, explicit units in titles/axis labels;
//   * colour follows the entity (each source has a fixed colour), the
//     previous week is a neutral reference grey;
//   * the in-progress week is drawn hatched and labelled "partial";
//   * every chart has a hover tooltip and an accessible table alternative.

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { SOURCE_ORDER, sourceColorVar, sourceLabel } from "@/lib/format";

const axisTick = { fill: "var(--text-3)", fontSize: 11 };

function Frame({ children, height }: { children: React.ReactNode; height: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

function TooltipBox({ active, payload, label }: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((a, p) => a + (Number(p.value) || 0), 0);
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-[var(--shadow-md)]">
      <p className="mb-1 font-medium text-text">{label}</p>
      {payload
        .filter((p) => Number(p.value) > 0)
        .map((p) => (
          <p key={String(p.dataKey)} className="flex items-center justify-between gap-4 text-text-2">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-sm" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="tabular text-text">{p.value}</span>
          </p>
        ))}
      {payload.length > 1 && (
        <p className="mt-1 flex justify-between border-t border-border pt-1 text-text">
          <span>Total</span>
          <span className="tabular">{total}</span>
        </p>
      )}
    </div>
  );
}

export type VolumePoint = { label: string; complete: boolean; bySource: Record<string, number>; relevant: number; unique: number };

/** Unique discussions per reporting week, stacked by source. */
export function VolumeChart({ data }: { data: VolumePoint[] }) {
  const sources = SOURCE_ORDER.filter((s) => data.some((d) => (d.bySource[s] ?? 0) > 0));
  const rows = data.map((d) => ({
    name: d.complete ? shortLabel(d.label) : `${shortLabel(d.label)} (partial)`,
    complete: d.complete,
    ...Object.fromEntries(sources.map((s) => [s, d.bySource[s] ?? 0])),
  }));
  return (
    <>
      <Frame height={220}>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap="28%">
          <defs>
            {sources.map((s) => (
              <pattern key={s} id={`hatch-${s}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill={sourceColorVar(s)} opacity={0.35} />
                <line x1="0" y1="0" x2="0" y2="6" stroke={sourceColorVar(s)} strokeWidth="2" />
              </pattern>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--axis)" }} interval={0} />
          <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={44} />
          <Tooltip content={<TooltipBox />} cursor={{ fill: "var(--surface-2)" }} />
          <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11, color: "var(--text-2)" }} formatter={(v) => sourceLabel(String(v))} />
          {sources.map((s, i) => (
            <Bar
              key={s}
              dataKey={s}
              name={sourceLabel(s)}
              stackId="v"
              fill={sourceColorVar(s)}
              stroke="var(--surface)"
              strokeWidth={1}
              radius={i === sources.length - 1 ? [3, 3, 0, 0] : 0}
              shape={(props: unknown) => {
                const p = props as { x: number; y: number; width: number; height: number; payload: { complete: boolean } };
                if (!p.height || p.height <= 0) return <g />;
                return <rect x={p.x} y={p.y} width={p.width} height={p.height} fill={p.payload.complete ? sourceColorVar(s) : `url(#hatch-${s})`} stroke="var(--surface)" strokeWidth={1} />;
              }}
            />
          ))}
        </BarChart>
      </Frame>
      <DataTable
        caption="Unique discussions per week by source"
        headers={["Week", ...sources.map(sourceLabel), "Relevant"]}
        rows={data.map((d) => [d.complete ? d.label : `${d.label}`, ...sources.map((s) => d.bySource[s] ?? 0), d.relevant])}
      />
    </>
  );
}

/** Current vs previous week per topic (relevant discussions, comparable sources). */
export function TopicCompareChart({ data, currentLabel, previousLabel }: { data: { name: string; current: number; previous: number }[]; currentLabel: string; previousLabel: string }) {
  const rows = data.slice(0, 10);
  return (
    <>
      <Frame height={Math.max(160, rows.length * 34 + 40)}>
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
          <CartesianGrid horizontal={false} stroke="var(--grid)" />
          <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" tick={{ ...axisTick, fill: "var(--text-2)" }} tickLine={false} axisLine={false} width={170} />
          <Tooltip content={<TooltipBox />} cursor={{ fill: "var(--surface-2)" }} />
          <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="previous" name={`Previous week (${previousLabel})`} fill="var(--series-ref)" radius={[0, 3, 3, 0]} />
          <Bar dataKey="current" name={`This week (${currentLabel})`} fill="var(--series-1)" radius={[0, 3, 3, 0]} />
        </BarChart>
      </Frame>
      <DataTable caption="Relevant discussions per topic" headers={["Topic", "Previous week", "This week"]} rows={rows.map((r) => [r.name, r.previous, r.current])} />
    </>
  );
}

function shortLabel(label: string) {
  // "2 Oct – 8 Oct 2026" → "2–8 Oct"; "26 Sept – 2 Oct 2026" → "26 Sept – 2 Oct"
  const m = label.match(/^(\d+) (\w+) – (\d+) (\w+)/);
  if (!m) return label;
  return m[2] === m[4] ? `${m[1]}–${m[3]} ${m[4]}` : `${m[1]} ${m[2]} – ${m[3]} ${m[4]}`;
}

/** Visually hidden-by-default table alternative for screen readers and "show data". */
function DataTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-2 text-xs text-text-3">
      <summary className="cursor-pointer select-none hover:text-text">Show data</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="tabular w-full text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-text-3">
              {headers.map((h) => (
                <th key={h} className="px-2 py-1 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border text-text-2">
                {r.map((c, j) => (
                  <td key={j} className="px-2 py-1">
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
