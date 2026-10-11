// Source Explorer: every collected discussion, searchable and filterable.
// Filters are a plain GET form, so URLs are shareable and it works without JS.

import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AiBadge, Badge, buttonClass, Card, EmptyState, ErrorPanel, inputClass, PageHeader, SourceBadge, SourceLink } from "@/components/ui";
import { listTopics } from "@/lib/db/config";
import { EXPLORER_PAGE_SIZE, searchDiscussions, type ExplorerFilters } from "@/lib/db/discussions";
import { listPainPoints } from "@/lib/db/painPoints";
import { safeLoad } from "@/lib/db/safe";
import { fmtDate, fmtDateTime, SOURCE_LABELS, TZ_LABEL } from "@/lib/format";
import { localMidnightUtc } from "@/lib/time/periods";
import { REPORT_TIMEZONE } from "@/lib/config";

export const metadata: Metadata = { title: "Discussions" };

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const dateParam = (v: string | undefined, plusDays = 0) => {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const [y, m, d] = v.split("-").map(Number);
  return localMidnightUtc({ y, m, d: d + plusDays }, REPORT_TIMEZONE).toISOString();
};

export default async function DiscussionsPage(props: PageProps<"/discussions">) {
  await connection();
  const sp = await props.searchParams;
  const status = (str(sp.status) ?? "relevant") as ExplorerFilters["status"];
  const filters: ExplorerFilters = {
    q: str(sp.q)?.slice(0, 100),
    source: str(sp.source) && SOURCE_LABELS[str(sp.source)!] ? str(sp.source) : undefined,
    topic: /^[0-9a-f-]{36}$/i.test(str(sp.topic) ?? "") ? str(sp.topic) : undefined,
    painPoint: /^[0-9a-f-]{36}$/i.test(str(sp.painPoint) ?? "") ? str(sp.painPoint) : undefined,
    status: ["relevant", "irrelevant", "pending", "excluded", "all"].includes(status ?? "") ? status : "relevant",
    from: dateParam(str(sp.from)),
    to: dateParam(str(sp.to), 1), // inclusive end date
    sort: (["recent", "engagement", "oldest"].includes(str(sp.sort) ?? "") ? str(sp.sort) : "recent") as ExplorerFilters["sort"],
    page: Math.max(1, Number(str(sp.page)) || 1),
  };

  const loaded = await safeLoad(async () => {
    const [result, topics, painPoints] = await Promise.all([searchDiscussions(filters), listTopics({ includeArchived: true }), listPainPoints()]);
    return { result, topics, painPoints };
  });
  if (!loaded.ok) return <ErrorPanel title="Could not load discussions" error={loaded.error} />;
  const { result, topics, painPoints } = loaded.data;
  const pages = Math.max(1, Math.ceil(result.total / EXPLORER_PAGE_SIZE));
  const pageHref = (p: number) => {
    const params = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "page" ? [[k, v]] : [])));
    params.set("page", String(p));
    return `/discussions?${params}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Source explorer"
        description={`Every discussion collected from public developer communities. Authors' words and the model's interpretation are shown separately. Dates in ${TZ_LABEL}.`}
      />

      <form method="get" className="grid gap-2 rounded-lg border border-border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-xs font-medium text-text-2 sm:col-span-2">
          Search title and text
          <input name="q" defaultValue={filters.q} placeholder="e.g. flaky, CodeRabbit, merge queue" className={inputClass} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-text-2">
          Status
          <select name="status" defaultValue={filters.status} className={inputClass}>
            <option value="relevant">Relevant (analysed)</option>
            <option value="irrelevant">Judged irrelevant</option>
            <option value="pending">Awaiting analysis / failed</option>
            <option value="excluded">Excluded by PM</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-text-2">
          Sort
          <select name="sort" defaultValue={filters.sort} className={inputClass}>
            <option value="recent">Most recent</option>
            <option value="engagement">Most engagement</option>
            <option value="oldest">Oldest</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-text-2">
          Source
          <select name="source" defaultValue={filters.source ?? ""} className={inputClass}>
            <option value="">All sources</option>
            {Object.entries(SOURCE_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-text-2">
          Topic (AI-assigned)
          <select name="topic" defaultValue={filters.topic ?? ""} className={inputClass}>
            <option value="">All topics</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.archived_at ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-text-2">
          Pain point
          <select name="painPoint" defaultValue={filters.painPoint ?? ""} className={inputClass}>
            <option value="">All pain points</option>
            {painPoints.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-xs font-medium text-text-2">
            From
            <input type="date" name="from" defaultValue={str(sp.from)} className={inputClass} />
          </label>
          <label className="grid gap-1 text-xs font-medium text-text-2">
            To
            <input type="date" name="to" defaultValue={str(sp.to)} className={inputClass} />
          </label>
        </div>
        <div className="flex items-end gap-2 lg:col-span-4">
          <button type="submit" className={buttonClass("primary")}>
            Apply filters
          </button>
          <Link href="/discussions" className={buttonClass("ghost")}>
            Reset
          </Link>
          <span className="ml-auto text-xs text-text-3">
            {result.total} result{result.total === 1 ? "" : "s"}
          </span>
        </div>
      </form>

      {result.rows.length === 0 ? (
        <EmptyState title="No discussions match these filters">Try a broader date range, another status, or clear the search.</EmptyState>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {result.rows.map((d) => {
              const a = d.analysis;
              const signals = d.signals as { kind?: string; isOpen?: boolean; hasAcceptedAnswer?: boolean };
              return (
                <li key={d.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-3">
                    <SourceBadge source={d.source_id} />
                    <span title={`Published ${fmtDateTime(d.published_at)} · retrieved ${fmtDateTime(d.first_retrieved_at)}`}>{fmtDate(d.published_at, { year: true })}</span>
                    {d.author && <span>by {d.author}</span>}
                    <span className="tabular">
                      {d.score ?? 0} pts · {d.comment_count ?? 0} {signals.kind === "question" ? "answers" : "comments"}
                    </span>
                    {signals.isOpen !== undefined && <span>{signals.isOpen ? "open issue" : "closed issue"}</span>}
                    {d.is_excluded && <Badge tone="warn">excluded{d.exclusion_reason ? `: ${d.exclusion_reason}` : ""}</Badge>}
                    {d.analysis_status === "pending" && <Badge>awaiting analysis</Badge>}
                    {d.analysis_status === "failed" && <Badge tone="bad">analysis failed</Badge>}
                  </div>
                  <div className="mt-1 flex items-start justify-between gap-3">
                    <SourceLink href={d.url} className="text-sm font-medium text-text">
                      {d.title}
                    </SourceLink>
                    <Link href={`/discussions/${d.id}`} className="shrink-0 text-xs text-accent-text hover:underline">
                      Details
                    </Link>
                  </div>
                  {d.excerpt && <p className="mt-1 line-clamp-2 text-sm text-text-2">{d.excerpt}</p>}
                  {a && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                      <AiBadge />
                      {a.is_relevant ? (
                        <>
                          {a.topic && <Badge>{a.topic.name}</Badge>}
                          {a.pain_point && (
                            <Link href={`/pain-points/${a.pain_point.id}`} className="hover:underline">
                              <Badge tone="accent">{a.pain_point.title}</Badge>
                            </Link>
                          )}
                          {a.is_unresolved && <Badge tone="warn">unresolved</Badge>}
                          {a.frustration && a.frustration !== "none" && <Badge title="Frustration judged from wording">frustration: {a.frustration}</Badge>}
                        </>
                      ) : (
                        <span className="text-text-3">Not relevant — {a.relevance_reason}</span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          {filters.page! > 1 ? <Link className={buttonClass("secondary", "sm")} href={pageHref(filters.page! - 1)}>← Previous</Link> : <span />}
          <span className="text-xs text-text-3">
            Page {filters.page} of {pages}
          </span>
          {filters.page! < pages ? <Link className={buttonClass("secondary", "sm")} href={pageHref(filters.page! + 1)}>Next →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
