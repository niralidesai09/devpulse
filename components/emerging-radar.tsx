// Emerging Topic Radar panel on the dashboard: new pain points that no
// monitored topic covers yet, found by Gemini. Approve turns one into a
// monitored topic; both buttons need the admin passcode.

import type { Suggestion } from "@/lib/db/dashboard";
import { fmtDate, SOURCE_LABEL } from "@/lib/format";
import { SuggestionButtons } from "./suggestion-buttons";

export function EmergingRadar({
  pending,
  decided,
  unlocked,
}: {
  pending: Suggestion[];
  decided: Suggestion[];
  unlocked: boolean;
}) {
  return (
    <section id="radar" className="scroll-mt-20" aria-labelledby="radar-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="radar-heading" className="text-[15px] font-semibold">
          Emerging topic radar
        </h2>
        <p className="text-xs text-ink-3">
          Recurring pain points none of your topics cover yet{unlocked ? "" : " · unlock to approve or reject"}
        </p>
      </div>

      {pending.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-line bg-surface p-4 text-sm text-ink-3">
          No new topic suggestions this week.
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
          {pending.map((s) => (
            <li key={s.id} className="flex min-w-0 flex-col rounded-md border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-medium">{s.name}</h3>
                <span className="tabular shrink-0 rounded-sm bg-accent-soft px-2 py-0.5 text-xs text-accent">
                  {s.postCount} thread{s.postCount === 1 ? "" : "s"}
                </span>
              </div>
              {s.description && <p className="mt-1 text-sm text-ink-2">{s.description}</p>}
              {s.rationale && <p className="mt-1 text-xs text-ink-3">Why it matters: {s.rationale}</p>}

              <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Suggested keywords">
                {s.keywords.map((k) => (
                  <li key={k} className="rounded bg-surface-2 px-2 py-0.5 font-mono text-xs text-ink-2">
                    {k}
                  </li>
                ))}
              </ul>

              <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                {s.evidence.slice(0, 4).map((e) => (
                  <li key={e.url} className="min-w-0 truncate">
                    <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      {e.title}
                    </a>
                    {e.source && <span className="text-xs text-ink-3"> · {SOURCE_LABEL[e.source] ?? e.source}</span>}
                  </li>
                ))}
              </ul>

              {unlocked && (
                <div className="mt-auto pt-4">
                  <SuggestionButtons id={s.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {decided.length > 0 && (
        <p className="mt-3 text-xs text-ink-3">
          Recently decided:{" "}
          {decided.map((s, i) => (
            <span key={s.id}>
              {i > 0 && " · "}
              {s.name} <span className={s.status === "approved" ? "text-good" : "text-ink-3"}>({s.status} {fmtDate(s.decidedAt)})</span>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
