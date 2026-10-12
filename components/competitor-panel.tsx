// Competitor radar: which code review / static analysis tools developers
// named this week, how often, and how they felt about them (with links).

import type { CompetitorRow } from "@/lib/db/dashboard";
import { SOURCE_LABEL } from "@/lib/format";

const label = (s: number) => (s <= -0.2 ? "negative" : s >= 0.2 ? "positive" : "mixed");

export function CompetitorPanel({ competitors }: { competitors: CompetitorRow[] }) {
  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <h2 className="text-[15px] font-semibold">Competitor radar</h2>
      <p className="mt-0.5 text-[13px] text-ink-3">Tools named in this week&apos;s relevant discussions. Sentiment is AI-assessed, from −1 (negative) to +1 (positive).</p>

      {competitors.length === 0 ? (
        <p className="mt-4 text-sm text-ink-3">No competitor tools were named this week.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {competitors.map((c) => (
            <li key={c.tool} className="py-3 first:pt-1">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-medium">{c.tool}</h3>
                <p className="tabular text-xs text-ink-2">
                  {c.mentions} mention{c.mentions === 1 ? "" : "s"}
                  {c.negative > 0 && <span className="text-ink-3"> · {c.negative} negative</span>}
                </p>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <SentimentBar value={c.avgSentiment} />
                <span className="tabular w-24 shrink-0 text-right text-xs text-ink-2">
                  {c.avgSentiment > 0 ? "+" : ""}
                  {c.avgSentiment.toFixed(2)} {label(c.avgSentiment)}
                </span>
              </div>
              <ul className="mt-1.5 space-y-0.5">
                {c.threads.map((t) => (
                  <li key={t.url} className="truncate text-xs">
                    <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      {t.title}
                    </a>
                    <span className="text-ink-3"> · {SOURCE_LABEL[t.source] ?? t.source}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** −1 … +1 bar filled from the centre: orange = negative, blue = positive. */
function SentimentBar({ value }: { value: number }) {
  const v = Math.max(-1, Math.min(1, value));
  const width = Math.max(Math.abs(v) * 50, 1.5);
  return (
    <div className="relative h-1.5 flex-1 rounded-full bg-surface-2" aria-hidden>
      <div
        className="absolute h-1.5 rounded-full"
        style={{ left: v < 0 ? `${50 - width}%` : "50%", width: `${width}%`, background: v < 0 ? "var(--series-2)" : "var(--series-1)" }}
      />
      <div className="absolute -top-0.5 left-1/2 h-2.5 w-px bg-ink-3" />
    </div>
  );
}
