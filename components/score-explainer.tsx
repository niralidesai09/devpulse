// "Why this score?": breaks a topic's Opportunity Score into its four
// factors, shows the real numbers behind each one and the exact maths.
// Every sentence here is built from stored numbers (no AI), so it can
// never disagree with the score.
//
//   score = frequency × growth × unresolved × severity,
//           then divided by the highest product this week × 100

import type { TopicCard } from "@/lib/db/dashboard";

export type ScoreContext = {
  maxMentions: number;
  mostDiscussed: string; // topic with the most mentions
  maxRaw: number;
  topTopic: string; // topic with the highest product (= score 100)
};

import { MIN_SAMPLE, SMOOTHING } from "@/lib/pipeline/scoring";
const f2 = (n: number) => n.toFixed(2);
const f4 = (n: number) => n.toFixed(4);

type Factor = { key: string; label: string; value: string; strength: number; detail: string; bar: React.ReactNode };

/** Which comparison the growth factor used, in plain words. */
function growthDetail(t: TopicCard): string {
  const hn = `Hacker News keyword matches: ${t.keywordsLastWeek ?? 0} last week → ${t.keywordsThisWeek ?? 0} this week`;
  switch (t.growthBasis) {
    case "previous_run":
      return `Mentions across all four sources compared with the previous weekly run (${t.vsPreviousRun}), smoothed with +${SMOOTHING} and kept between ×0.5 and ×2.`;
    case "hn_keywords":
      return `${hn} → (${t.keywordsThisWeek} + ${SMOOTHING}) ÷ (${t.keywordsLastWeek} + ${SMOOTHING}). Hacker News only; the +${SMOOTHING} smooths small numbers; kept between ×0.5 and ×2.`;
    default:
      return t.keywordsThisWeek === null
        ? "No comparison data this week, so growth is neutral (×1)."
        : `${hn}: fewer than ${MIN_SAMPLE} in total, too few to compare, so growth is neutral (×1).`;
  }
}

export function ScoreExplainer({ topic: t, ctx }: { topic: TopicCard; ctx: ScoreContext }) {
  const c = t.components;

  const factors: Factor[] = [
    {
      key: "frequency",
      label: "Frequency",
      value: f2(c.frequency),
      strength: c.frequency,
      detail:
        t.name === ctx.mostDiscussed
          ? `${t.mentions} relevant ${t.mentions === 1 ? "post" : "posts"} across all four sources: the most-discussed topic this week.`
          : `${t.mentions} relevant ${t.mentions === 1 ? "post" : "posts"} across all four sources, vs ${ctx.maxMentions} for the most-discussed topic (${ctx.mostDiscussed}).`,
      bar: <Bar fraction={c.frequency} />,
    },
    {
      key: "growth",
      label: "Growth",
      value: `×${f2(c.growth)}`,
      strength: (c.growth - 0.5) / 1.5, // 0.5..2 mapped to 0..1
      detail: growthDetail(t),
      bar: <GrowthBar growth={c.growth} />,
    },
    {
      key: "unresolved",
      label: "Unresolved",
      value: f2(c.unresolved),
      strength: c.unresolved,
      detail: `${t.unresolvedCount} of ${t.mentions} posts describe a problem with no working fix (open issue, no accepted answer, or no solution in the thread).`,
      bar: <Bar fraction={c.unresolved} />,
    },
    {
      key: "severity",
      label: "Severity",
      value: f2(c.severity),
      strength: c.severity,
      detail:
        t.avgSeverity === null
          ? "No posts, so no severity."
          : `Average severity ${t.avgSeverity.toFixed(1)} out of 5 (1 = minor annoyance, 3 = slows a team down, 5 = outages, cost or security risk).`,
      bar: <Bar fraction={c.severity} />,
    },
  ];

  const sorted = [...factors].sort((a, b) => b.strength - a.strength);
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];

  return (
    <details className="group mt-4 rounded-md border border-line bg-bg/60">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-ink-2 hover:text-ink">
        <span>Why this score?</span>
        <span aria-hidden className="text-ink-3 transition-transform group-open:rotate-90">›</span>
      </summary>

      <div className="border-t border-line px-3 pt-3 pb-3">
        <p className="text-xs text-ink-2">
          Pushed up most by <strong className="font-medium text-ink">{strongest.label.toLowerCase()}</strong>, held back most by{" "}
          <strong className="font-medium text-ink">{weakest.label.toLowerCase()}</strong>.
        </p>

        <dl className="mt-3 space-y-3">
          {factors.map((f) => (
            <div key={f.key}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <dt className="font-medium text-ink">{f.label}</dt>
                <dd className="tabular font-mono text-ink">{f.value}</dd>
              </div>
              <div className="mt-1">{f.bar}</div>
              <p className="mt-1 text-xs text-ink-3">{f.detail}</p>
            </div>
          ))}
        </dl>

        {/* The exact maths, so anyone can recompute it. */}
        <div className="tabular mt-4 overflow-x-auto rounded-md bg-surface-2 px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-2">
          <p className="whitespace-nowrap">
            {f4(c.frequency)} × {f4(c.growth)} × {f4(c.unresolved)} × {f4(c.severity)} = {f4(c.raw)}
          </p>
          <p className="whitespace-nowrap">
            {f4(c.raw)} ÷ {f4(ctx.maxRaw)} × 100 = <span className="font-medium text-ink">{t.opportunityScore}</span>
          </p>
        </div>
        <p className="mt-1.5 text-[11px] text-ink-3">
          {f4(ctx.maxRaw)} is this week&apos;s highest product ({ctx.topTopic}). The score is relative: the top topic always scores 100, so it ranks topics against each other rather than measuring market size.
        </p>
      </div>
    </details>
  );
}

/** 0..1 bar. */
function Bar({ fraction }: { fraction: number }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <div className="h-1.5 rounded-full bg-surface-2" aria-hidden>
      <div className="h-1.5 rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Growth on a ×0.5 … ×2 track, filled from the ×1 ("no change") mark. */
function GrowthBar({ growth }: { growth: number }) {
  const pos = (g: number) => ((Math.max(0.5, Math.min(2, g)) - 0.5) / 1.5) * 100;
  const one = pos(1);
  const at = pos(growth);
  const left = Math.min(one, at);
  const width = Math.abs(at - one);
  return (
    <div className="relative h-1.5 rounded-full bg-surface-2" aria-hidden>
      <div
        className={`absolute h-1.5 rounded-full ${growth >= 1 ? "bg-accent" : "bg-ink-3"}`}
        style={{ left: `${left}%`, width: `${Math.max(width, 1)}%` }}
      />
      <div className="absolute -top-0.5 h-2.5 w-px bg-ink-2" style={{ left: `${one}%` }} title="×1 = no change" />
    </div>
  );
}
