// Sales objection radar: objections developers raise against code review
// automation (from this week's threads), each with an honest suggested
// response for Sumit's sales team and the evidence behind it.

import type { ObjectionRow } from "@/lib/db/dashboard";
import { SOURCE_LABEL } from "@/lib/format";

export function ObjectionsPanel({ objections }: { objections: ObjectionRow[] }) {
  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <h2 className="text-[15px] font-semibold">Objections you may hear in demos</h2>
      <p className="mt-0.5 text-[13px] text-ink-3">Drawn from this week&apos;s discussions. Responses are AI suggestions, written as honest talking points.</p>

      {objections.length === 0 ? (
        <p className="mt-4 text-sm text-ink-3">Objections appear after the next run writes the brief.</p>
      ) : (
        <ol className="mt-3 space-y-4">
          {objections.map((o, i) => (
            <li key={i} className="border-t border-line pt-3 first:border-0 first:pt-0">
              <p className="text-sm font-medium">“{o.objection}”</p>
              <p className="mt-1 text-sm text-ink-2">
                <span className="font-medium text-ink">Suggested response: </span>
                {o.response}
              </p>
              {o.evidence.length > 0 && (
                <p className="mt-1 flex flex-wrap gap-x-2 text-xs">
                  <span className="text-ink-3">Seen in:</span>
                  {o.evidence.map((e) => (
                    <a key={e.url} href={e.url} target="_blank" rel="noopener noreferrer" title={e.title} className="text-accent hover:underline">
                      {SOURCE_LABEL[e.source] ?? e.source}
                    </a>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
