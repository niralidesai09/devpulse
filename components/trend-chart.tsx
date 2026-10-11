"use client";
// Week-over-week chart: Hacker News keyword matches per topic,
// this week vs the 7 days before (the same numbers behind the trend %).
// Horizontal bars so long topic names stay readable on phones.

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type TrendDatum = { topic: string; thisWeek: number; lastWeek: number; trendLabel: string };

const SERIES = [
  { key: "thisWeek", name: "This week", color: "var(--series-1)" },
  { key: "lastWeek", name: "Last week", color: "var(--series-2)" },
] as const;

const shorten = (name: string, max = 22) => (name.length > max ? name.slice(0, max - 1).trimEnd() + "…" : name);

// Left-hand label, two lines: topic name, then "this vs last · change".
// This puts the actual numbers next to every pair of bars.
// Recharts passes x, y and payload; we pass byTopic ourselves.
function TopicTick({
  x,
  y,
  payload,
  byTopic,
}: {
  x?: number | string;
  y?: number | string;
  payload?: { value: string };
  byTopic: Map<string, TrendDatum>;
}) {
  const d = payload ? byTopic.get(payload.value) : undefined;
  if (!d) return null;
  return (
    <text x={Number(x) - 6} y={Number(y)} textAnchor="end" fontSize={12}>
      <title>{d.topic}</title>
      <tspan x={Number(x) - 6} dy={-3} fill="var(--ink)">
        {shorten(d.topic)}
      </tspan>
      <tspan x={Number(x) - 6} dy={15} fill="var(--ink-3)" fontSize={11} className="tabular">
        {d.thisWeek} vs {d.lastWeek} · {d.trendLabel}
      </tspan>
    </text>
  );
}

export function TrendChart({ data }: { data: TrendDatum[] }) {
  if (data.length === 0) return <p className="text-sm text-ink-3">No trend data in this run.</p>;
  const byTopic = new Map(data.map((d) => [d.topic, d]));

  return (
    <figure>
      {/* Legend (two series -> always shown, colour is never the only cue). */}
      <div className="mb-2 flex gap-4 text-xs text-ink-2">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
            {s.name}
          </span>
        ))}
      </div>

      <div style={{ height: 40 + data.length * 52 }} role="img" aria-label="Keyword matches this week versus last week, per topic">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="30%">
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis type="category" dataKey="topic" width={158} tickLine={false} axisLine={false} interval={0} tick={<TopicTick byTopic={byTopic} />} />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "var(--ink)", fontWeight: 600 }}
              itemStyle={{ color: "var(--ink-2)" }}
              formatter={(value, name) => [`${value} matches`, name]}
            />
            {SERIES.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[0, 4, 4, 0]} maxBarSize={14} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <figcaption className="mt-2 text-xs text-ink-3">
        Hacker News posts and comments matching each topic&apos;s keywords. Small numbers swing a lot week to week.
      </figcaption>

      {/* Same numbers as a table, for screen readers and anyone who prefers it. */}
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-ink-2 hover:text-ink">Show as table</summary>
        <table className="tabular mt-2 w-full text-left">
          <thead className="text-ink-3">
            <tr>
              <th className="py-1 font-medium">Topic</th>
              <th className="py-1 text-right font-medium">This week</th>
              <th className="py-1 text-right font-medium">Last week</th>
              <th className="py-1 text-right font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.topic} className="border-t border-line">
                <td className="py-1 pr-2">{d.topic}</td>
                <td className="py-1 text-right">{d.thisWeek}</td>
                <td className="py-1 text-right">{d.lastWeek}</td>
                <td className="py-1 text-right">{d.trendLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
