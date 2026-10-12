// Evidence links: the original discussions behind an AI statement.
// URLs always come from the database, never from model output.

import Link from "next/link";
import type { EvidenceDoc } from "@/lib/views/overview";
import { fmtDate, sourceColorVar, sourceLabel } from "@/lib/format";
import { isSafeHttpUrl } from "@/lib/text";

/** HN comments share their story's title, so show the commenter's own words instead. */
export function evidenceLabel(d: Pick<EvidenceDoc, "title" | "excerpt">): string {
  if (d.title.startsWith("Comment on:") && d.excerpt) {
    const words = d.excerpt.replace(/^…/, "").trim();
    return `“${words.length > 80 ? words.slice(0, 79) + "…" : words}”`;
  }
  return d.title;
}

export function EvidenceLinks({ ids, docs, max = 3, label = "Evidence" }: { ids: string[]; docs: Map<string, EvidenceDoc>; max?: number; label?: string }) {
  const list = ids.map((id) => docs.get(id)).filter((d): d is EvidenceDoc => Boolean(d));
  if (!list.length) return null;
  return (
    <div className="mt-2 flex flex-col gap-1 text-[12px] leading-[18px]">
      <span className="font-medium text-ink-3">
        {label} · {list.length} discussion{list.length === 1 ? "" : "s"}
      </span>
      <ul className="grid gap-1.5">{list.slice(0, max).map((d) => <EvidenceItem key={d.id} d={d} />)}</ul>
      {list.length > max && (
        <details className="group">
          <summary className="cursor-pointer list-none text-ink-3 hover:text-ink-2 group-open:hidden [&::-webkit-details-marker]:hidden">+ {list.length - max} more</summary>
          <ul className="grid gap-1.5">{list.slice(max).map((d) => <EvidenceItem key={d.id} d={d} />)}</ul>
        </details>
      )}
    </div>
  );
}

function EvidenceItem({ d }: { d: EvidenceDoc }) {
  return (
    <li className="grid min-w-0 grid-cols-[0.375rem_minmax(0,1fr)] gap-x-2">
      <span aria-hidden className="mt-[7px] size-1.5 rounded-full" style={{ background: sourceColorVar(d.source_id) }} />
      {isSafeHttpUrl(d.url) ? (
        <a
          href={d.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="truncate text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-accent-ink hover:decoration-accent"
          title={`${d.title} — ${sourceLabel(d.source_id)}, ${fmtDate(d.published_at)} (opens the original)`}
        >
          {evidenceLabel(d)}
        </a>
      ) : (
        <span className="truncate text-ink-2">{evidenceLabel(d)}</span>
      )}
      <span className="col-start-2 text-[11px] text-ink-3">
        {sourceLabel(d.source_id)} · {fmtDate(d.published_at)}
        {d.is_excluded && " · excluded later"} ·{" "}
        <Link href={`/discussions/${d.id}`} className="hover:text-ink" title="See why this discussion was classified this way">
          why it counts
        </Link>
      </span>
    </li>
  );
}
