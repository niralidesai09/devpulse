// Evidence: the catalogue of every relevant discussion in the latest run.
// Original source fields (title, excerpt, time, link) are shown verbatim;
// topic, summary and status are AI-assisted and labelled as such.
// Filters are a plain GET form, so results are linkable and work without JS.

import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { Search } from "lucide-react";
import { EmptyState, ExternalLink, PageHeader, ProvenanceLabel, SOURCE_CODE, StatusText } from "@/components/ui";
import { getEvidence, parseEvidenceFilters, type EvidenceRecord } from "@/lib/db/evidence";
import { fmtDate, fmtDateTime, SOURCE_LABEL, stripMarkdownSyntax } from "@/lib/format";

export const metadata: Metadata = { title: "Evidence" };

const control =
  "h-9 w-full rounded-md border border-line-strong bg-surface px-2.5 text-[13.5px] text-ink focus-visible:outline-2 focus-visible:outline-accent";

export default async function EvidencePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const filters = parseEvidenceFilters(await searchParams);
  const result = await getEvidence(filters);

  if (!result) {
    return (
      <main className="mx-auto max-w-[1200px] px-5 py-8 lg:px-10">
        <PageHeader title="Evidence" />
        <div className="mt-6">
          <EmptyState title="No discussions stored yet">Evidence appears after the first collection run.</EmptyState>
        </div>
      </main>
    );
  }

  const filtered = Boolean(filters.q || filters.source || filters.topic || filters.status || filters.within);

  return (
    <main className="mx-auto max-w-[1200px] space-y-6 px-5 py-6 lg:px-10 lg:py-8">
      <PageHeader
        title="Evidence"
        description={
          <p>
            Every relevant discussion from the latest collection (week {fmtDate(result.windowStart)} – {fmtDate(result.windowEnd)}). Titles,
            excerpts, dates and links are original; topic, summary and status are AI-assisted.
          </p>
        }
      />

      <form method="get" className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto] md:items-end" role="search">
        <label className="col-span-2 md:col-span-1">
          <span className="mb-1 block text-[12px] font-medium text-ink-2">Search</span>
          <span className="relative block">
            <Search aria-hidden size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-3" />
            <input name="q" defaultValue={filters.q} placeholder="Title, excerpt, keyword…" className={`${control} pl-8`} />
          </span>
        </label>
        <label>
          <span className="mb-1 block text-[12px] font-medium text-ink-2">Source</span>
          <select name="source" defaultValue={filters.source} className={control}>
            <option value="">All sources</option>
            {result.sources.map((s) => (
              <option key={s.id} value={s.id}>
                {SOURCE_LABEL[s.id] ?? s.id} ({s.count})
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-[12px] font-medium text-ink-2">Topic</span>
          <select name="topic" defaultValue={filters.topic} className={control}>
            <option value="">All topics</option>
            {result.topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.count})
              </option>
            ))}
            {result.unmonitored > 0 && <option value="none">Not yet monitored ({result.unmonitored})</option>}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-[12px] font-medium text-ink-2">Status</span>
          <select name="status" defaultValue={filters.status} className={control}>
            <option value="">Any status</option>
            <option value="unresolved">Unresolved</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>
        <label>
          <span className="mb-1 block text-[12px] font-medium text-ink-2">Published</span>
          <select name="within" defaultValue={filters.within} className={control}>
            <option value="">This week</option>
            <option value="1">Last 24 hours</option>
            <option value="3">Last 3 days</option>
          </select>
        </label>
        <div className="col-span-2 flex items-end gap-2 md:col-span-1">
          <input type="hidden" name="sort" value={filters.sort} />
          <button type="submit" className="h-9 rounded-md bg-accent px-4 text-[13.5px] font-medium text-accent-ink hover:opacity-90">
            Apply
          </button>
          {filtered && (
            <Link href="/evidence" className="flex h-9 items-center px-2 text-[13px] text-ink-2 hover:text-ink">
              Reset
            </Link>
          )}
        </div>
      </form>

      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
        <p className="tabular text-[13px] text-ink-2" aria-live="polite">
          Showing {result.records.length} of {result.total} discussions
        </p>
        <p className="text-[13px] text-ink-3">
          Sort:{" "}
          <SortLink current={filters.sort} value="newest" filters={filters}>
            newest
          </SortLink>{" "}
          ·{" "}
          <SortLink current={filters.sort} value="discussed" filters={filters}>
            most discussed
          </SortLink>
        </p>
      </div>

      {result.records.length === 0 ? (
        <EmptyState title="No discussions match these filters" action={<Link href="/evidence" className="text-[13.5px] font-medium text-accent hover:underline">Clear all filters</Link>}>
          Try a broader search, or choose a different source or topic.
        </EmptyState>
      ) : (
        <ol className="divide-y divide-line">
          {result.records.map((r) => (
            <EvidenceItem key={r.id} record={r} />
          ))}
        </ol>
      )}
    </main>
  );
}

function SortLink({
  current,
  value,
  filters,
  children,
}: {
  current: string;
  value: string;
  filters: Record<string, string>;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams(Object.entries({ ...filters, sort: value }).filter(([, v]) => v) as [string, string][]);
  return current === value ? (
    <span className="font-medium text-ink" aria-current="true">
      {children}
    </span>
  ) : (
    <Link href={`/evidence?${params}`} className="text-accent hover:underline">
      {children}
    </Link>
  );
}

function EvidenceItem({ record: r }: { record: EvidenceRecord }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-2 py-5 md:grid-cols-[9rem_minmax(0,1fr)]">
      <div className="text-[12px] leading-relaxed text-ink-3">
        <p className="tabular font-mono text-ink-2" title={`${SOURCE_LABEL[r.source] ?? r.source} record ${r.externalId}`}>
          {SOURCE_CODE[r.source] ?? r.source} {r.externalId}
        </p>
        <p>{SOURCE_LABEL[r.source] ?? r.source}</p>
        <p>
          Published <time dateTime={r.postedAt ?? undefined}>{r.postedAt ? fmtDateTime(r.postedAt) : "unknown"}</time>
        </p>
        {r.retrievedAt && (
          <p>
            Retrieved <time dateTime={r.retrievedAt}>{fmtDateTime(r.retrievedAt)}</time>
          </p>
        )}
      </div>

      <div className="min-w-0">
        {r.urlValid ? (
          <ExternalLink href={r.url} source={r.source} className="text-[15px] leading-snug font-medium text-ink">
            {r.title}
          </ExternalLink>
        ) : (
          <p className="text-[15px] leading-snug font-medium text-ink [overflow-wrap:anywhere]">
            {r.title} <span className="text-[12.5px] font-normal text-ink-3">(original link unavailable)</span>
          </p>
        )}

        {r.snippet && (
          <blockquote className="mt-2 max-w-[80ch] border-l border-line-strong pl-3 text-[13.5px] leading-relaxed text-ink-2 [overflow-wrap:anywhere]">
            {stripMarkdownSyntax(r.snippet)}
          </blockquote>
        )}

        <p className="tabular mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-ink-3">
          {r.matchedKeyword && <span>Matched “{r.matchedKeyword}”</span>}
          <span>
            {r.score} {r.source === "hackernews" ? "points" : r.source === "stackoverflow" ? "votes" : "reactions"} · {r.comments}{" "}
            {r.source === "stackoverflow" ? "answers" : "comments"}
          </span>
          {r.author && <span>by {r.author}</span>}
        </p>

        <div className="mt-3 rounded-md bg-surface-2/70 px-3 py-2 text-[13px]">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-2">
            <ProvenanceLabel kind="ai" />
            <span>{r.topicName ?? "Not yet monitored"}</span>
            <StatusText unresolved={r.isUnresolved} />
            {r.severity ? <span className="tabular">Severity {r.severity}/5</span> : null}
          </p>
          {r.painPoint && <p className="mt-1 text-ink">{r.painPoint}</p>}
          {r.unresolvedReason && <p className="mt-0.5 text-[12.5px] text-ink-3">Status evidence: {r.unresolvedReason}</p>}
        </div>
      </div>
    </li>
  );
}
