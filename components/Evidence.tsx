// Evidence chips: the original discussions behind an AI statement.
// Links come from the database (never from model output).

import Link from "next/link";
import type { EvidenceDoc } from "@/lib/views/overview";
import { fmtDate, sourceLabel } from "@/lib/format";
import { isSafeHttpUrl } from "@/lib/text";
import { sourceColorVar } from "@/lib/format";

export function EvidenceChips({ ids, docs, max = 3 }: { ids: string[]; docs: Map<string, EvidenceDoc>; max?: number }) {
  const list = ids.map((id) => docs.get(id)).filter((d): d is EvidenceDoc => Boolean(d));
  if (!list.length) return <span className="text-xs text-text-3">No linked evidence</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {list.slice(0, max).map((d) => (
        <span key={d.id} className="inline-flex max-w-[22rem] items-center gap-1 rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] text-text-2">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: sourceColorVar(d.source_id) }} />
          {isSafeHttpUrl(d.url) ? (
            <a href={d.url} target="_blank" rel="noopener noreferrer nofollow" className="truncate hover:text-text hover:underline" title={`${d.title} — ${sourceLabel(d.source_id)}, ${fmtDate(d.published_at)} (opens original)`}>
              {d.title}
            </a>
          ) : (
            <span className="truncate">{d.title}</span>
          )}
          {d.is_excluded && <span className="text-warn" title="Excluded by the PM after this report was generated">(excluded)</span>}
          <Link href={`/discussions/${d.id}`} className="shrink-0 text-text-3 hover:text-text" title="Why the AI classified it this way">
            ⓘ
          </Link>
        </span>
      ))}
      {list.length > max && <span className="text-[11px] text-text-3">+{list.length - max} more</span>}
    </span>
  );
}
