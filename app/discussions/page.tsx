// Discussions — the evidence explorer. Filters are a plain GET form: shareable
// URLs, back-button friendly, and working without JavaScript.

import { ArrowRight, MessagesSquare, Search, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { evidenceLabel } from "@/components/Evidence";
import { Badge, buttonClass, cx, EmptyState, ErrorPanel, inputClass, PageHeader, SourceLink, SourceTag } from "@/components/ui";
import { REPORT_TIMEZONE } from "@/lib/config";
import { listTopics } from "@/lib/db/config";
import { EXPLORER_PAGE_SIZE, searchDiscussions, type ExplorerFilters } from "@/lib/db/discussions";
import { listPainPoints } from "@/lib/db/painPoints";
import { safeLoad } from "@/lib/db/safe";
import { fmtDate, fmtDateTime, SOURCE_LABELS, TZ_LABEL } from "@/lib/format";
import { readableExcerpt } from "@/lib/text";
import { localMidnightUtc } from "@/lib/time/periods";

export const metadata: Metadata = { title: "Discussions" };

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);
const uuid = (v: string | undefined) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
const dateParam = (v: string | undefined, plusDays = 0) => {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const [y, m, d] = v.split("-").map(Number);
  return localMidnightUtc({ y, m, d: d + plusDays }, REPORT_TIMEZONE).toISOString();
};
const selectClass = cx(inputClass, "h-9 w-auto min-w-0 pr-8");

const STATUS_OPTIONS = [
  { value: "relevant", label: "Relevant" },
  { value: "irrelevant", label: "Not relevant" },
  { value: "pending", label: "Awaiting analysis" },
  { value: "excluded", label: "Excluded by you" },
  { value: "all", label: "All" },
] as const;

export default async function DiscussionsPage(props: PageProps<"/discussions">) {
  await connection();
  const sp = await props.searchParams;
  const status = (STATUS_OPTIONS.find((o) => o.value === str(sp.status))?.value ?? "relevant") as ExplorerFilters["status"];
  const filters: ExplorerFilters = {
    q: str(sp.q)?.slice(0, 100),
    source: str(sp.source) && SOURCE_LABELS[str(sp.source)!] ? str(sp.source) : undefined,
    topic: uuid(str(sp.topic)),
    painPoint: uuid(str(sp.painPoint)),
    status,
    from: dateParam(str(sp.from)),
    to: dateParam(str(sp.to), 1), // inclusive end date
    sort: (["recent", "engagement", "oldest"].includes(str(sp.sort) ?? "") ? str(sp.sort) : "recent") as ExplorerFilters["sort"],
    page: Math.max(1, Number(str(sp.page)) || 1),
  };
  const filtered = Boolean(filters.q || filters.source || filters.topic || filters.painPoint || filters.from || filters.to || status !== "relevant");

  const loaded = await safeLoad(async () => {
    const [result, topics, painPoints] = await Promise.all([searchDiscussions(filters), listTopics({ includeArchived: true }), listPainPoints()]);
    return { result, topics, painPoints };
  });
  if (!loaded.ok) return <ErrorPanel title="Could not load discussions" error={loaded.error} />;
  const { result, topics, painPoints } = loaded.data;
  const pages = Math.max(1, Math.ceil(result.total / EXPLORER_PAGE_SIZE));
  const pageHref = (p: number) => {
    const params = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && v && k !== "page" ? [[k, v]] : [])));
    if (p > 1) params.set("page", String(p));
    return `/discussions${params.size ? `?${params}` : ""}`;
  };
  const ppTitle = filters.painPoint ? painPoints.find((p) => p.id === filters.painPoint)?.title : undefined;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Discussions"
        description="What developers actually wrote. Search and filter every collected post, open the original, and see why Gemini considered it relevant."
        meta={<span>Dates in {TZ_LABEL}</span>}
      />

      <form method="get" role="search" className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Search titles and text</span>
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
            <input name="q" defaultValue={filters.q} placeholder="Search — e.g. flaky, CodeRabbit, merge queue" className={cx(inputClass, "pl-9")} />
          </label>
          <div className="flex gap-2">
            <button type="submit" className={buttonClass("primary")}>
              Search
            </button>
            {filtered && (
              <Link href="/discussions" className={buttonClass("ghost")}>
                Clear
              </Link>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-[12px] text-ink-3">
            Show
            <select name="status" defaultValue={status} className={selectClass}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[12px] text-ink-3">
            Source
            <select name="source" defaultValue={filters.source ?? ""} className={selectClass}>
              <option value="">All sources</option>
              {Object.entries(SOURCE_LABELS).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[12px] text-ink-3">
            Topic
            <select name="topic" defaultValue={filters.topic ?? ""} className={cx(selectClass, "max-w-[14rem]")}>
              <option value="">All topics</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[12px] text-ink-3">
            Pain point
            <select name="painPoint" defaultValue={filters.painPoint ?? ""} className={cx(selectClass, "max-w-[16rem]")}>
              <option value="">All pain points</option>
              {painPoints.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[12px] text-ink-3">
            From
            <input type="date" name="from" defaultValue={str(sp.from)} className={selectClass} />
          </label>
          <label className="grid gap-1 text-[12px] text-ink-3">
            To
            <input type="date" name="to" defaultValue={str(sp.to)} className={selectClass} />
          </label>
          <label className="grid gap-1 text-[12px] text-ink-3">
            Sort by
            <select name="sort" defaultValue={filters.sort} className={selectClass}>
              <option value="recent">Newest first</option>
              <option value="engagement">Most engagement</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
          <button type="submit" className={buttonClass("secondary")}>
            Apply
          </button>
        </div>
      </form>

      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
        <p className="text-[14px] text-ink-2">
          <span className="tabular font-semibold text-ink">{result.total}</span> discussion{result.total === 1 ? "" : "s"}
          {ppTitle && (
            <>
              {" "}
              about <span className="font-medium text-ink">{ppTitle}</span>
            </>
          )}
        </p>
        {pages > 1 && (
          <span className="text-[12px] text-ink-3">
            Page {filters.page} of {pages}
          </span>
        )}
      </div>

      {result.rows.length === 0 ? (
        <EmptyState icon={<MessagesSquare className="size-8" strokeWidth={1.5} aria-hidden />} title="No discussions match" action={filtered ? <Link href="/discussions" className={buttonClass("secondary", "sm")}>Clear filters</Link> : undefined}>
          Try a broader date range, a different source, or a shorter search.
        </EmptyState>
      ) : (
        <ul className="-mt-4 divide-y divide-line">
          {result.rows.map((d) => {
            const a = d.analysis;
            const signals = d.signals as { kind?: string; isOpen?: boolean };
            const isComment = d.title.startsWith("Comment on:");
            return (
              <li key={d.id} className="py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <SourceLink href={d.url} className="text-[15px] leading-[22px] font-semibold break-words text-ink">
                      {isComment ? evidenceLabel(d) : d.title}
                    </SourceLink>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
                      <SourceTag source={d.source_id} />
                      {isComment && <span className="truncate">{d.title}</span>}
                      <span title={`Published ${fmtDateTime(d.published_at)} · first collected ${fmtDateTime(d.first_retrieved_at)}`}>{fmtDate(d.published_at, { year: true })}</span>
                      {d.author && <span>by {d.author}</span>}
                      <span className="tabular">
                        {d.score ?? 0} {d.source_id === "github" ? "reactions" : "points"} · {d.comment_count ?? 0} {signals.kind === "question" ? "answers" : "comments"}
                      </span>
                      {signals.isOpen !== undefined && <span>{signals.isOpen ? "Open issue" : "Closed issue"}</span>}
                    </div>
                  </div>
                  <Link href={`/discussions/${d.id}`} className="hidden shrink-0 items-center gap-1 text-[13px] text-ink-3 hover:text-accent-ink sm:inline-flex">
                    Details <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </div>

                {d.excerpt && d.excerpt !== d.title && (
                  <details className="group mt-2 max-w-3xl">
                    <summary className="cursor-pointer list-none text-[14px] leading-[22px] text-ink-2 [&::-webkit-details-marker]:hidden">
                      <span className="line-clamp-2 group-open:line-clamp-none">{readableExcerpt(d.excerpt)}</span>
                      {d.excerpt.length > 180 && <span className="mt-0.5 block text-[12px] text-ink-3 group-open:hidden">Show more</span>}
                    </summary>
                  </details>
                )}

                <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px]">
                  {d.is_excluded && <Badge tone="up" wrap>Excluded{d.exclusion_reason ? `: ${d.exclusion_reason}` : ""}</Badge>}
                  {d.analysis_status === "pending" && <Badge>Awaiting analysis</Badge>}
                  {d.analysis_status === "failed" && <Badge tone="bad">Analysis failed — will retry</Badge>}
                  {a && a.is_relevant && (
                    <>
                      <Sparkles aria-hidden className="size-3.5 text-accent-ink" />
                      {a.pain_point && (
                        <Link href={`/pain-points/${a.pain_point.id}`} className="min-w-0">
                          <Badge tone="accent" wrap className="hover:bg-accent/15">
                            {a.pain_point.title}
                          </Badge>
                        </Link>
                      )}
                      {a.topic && <Badge>{a.topic.name}</Badge>}
                      {a.is_unresolved && <Badge tone="up">Unresolved</Badge>}
                    </>
                  )}
                  {a && !a.is_relevant && (
                    <span className="text-ink-3">
                      <Sparkles aria-hidden className="mr-1 inline size-3.5 align-[-2px]" />
                      Not relevant: {a.relevance_reason}
                    </span>
                  )}
                  <Link href={`/discussions/${d.id}`} className="text-ink-3 hover:text-accent-ink sm:hidden">
                    Details →
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between border-t border-line pt-4">
          {filters.page! > 1 ? (
            <Link className={buttonClass("secondary", "sm")} href={pageHref(filters.page! - 1)}>
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-[13px] text-ink-3">
            Page {filters.page} of {pages}
          </span>
          {filters.page! < pages ? (
            <Link className={buttonClass("secondary", "sm")} href={pageHref(filters.page! + 1)}>
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
