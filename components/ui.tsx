// Shared building blocks: one vocabulary across every page.
// Server-safe (no hooks). Colours come only from the design tokens.

import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  MoveRight,
  Sparkle,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { fmtDate, SOURCE_LABEL } from "@/lib/format";

/** Short catalogue code per source, used in record ids (e.g. "GH 5816317078"). */
export const SOURCE_CODE: Record<string, string> = { hackernews: "HN", github: "GH", stackoverflow: "SO", devto: "DEV" };

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-serif text-[28px] leading-tight font-semibold tracking-[-0.015em] text-balance">{title}</h1>
        {description && <div className="mt-1.5 max-w-[72ch] text-[14.5px] text-ink-2">{description}</div>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </header>
  );
}

export function Section({
  title,
  description,
  actions,
  id,
  children,
  className = "",
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={`scroll-mt-20 ${className}`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 id={headingId} className="text-[15px] font-semibold text-ink">
            {title}
          </h2>
          {description && <p className="mt-0.5 max-w-[80ch] text-[13px] text-ink-3">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** A flat content sheet: hairline border, no shadow. */
export function Sheet({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-md border border-line bg-surface ${className}`}>{children}</div>;
}

/** Field label separating measured facts from AI interpretation. */
export function ProvenanceLabel({ kind }: { kind: "observed" | "ai" }) {
  return kind === "observed" ? (
    <span className="text-[12px] font-medium text-ink-3">Observed in discussions</span>
  ) : (
    <span className="inline-flex items-center rounded-sm border border-line-strong px-1.5 py-px text-[11.5px] font-medium text-ink-2">
      AI interpretation
    </span>
  );
}

export function StatusText({ unresolved }: { unresolved: boolean }) {
  return unresolved ? (
    <span className="text-warn">Unresolved</span>
  ) : (
    <span className="text-good">Resolved</span>
  );
}

/** One catalogued source record: the evidence unit used on every page. */
export function RecordRow({
  source,
  externalId,
  title,
  url,
  postedAt,
  unresolved,
  severity,
  detail,
  compact = false,
}: {
  source: string;
  externalId: string;
  title: string;
  url: string;
  postedAt: string | null;
  unresolved?: boolean;
  severity?: number | null;
  detail?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)] gap-x-4 sm:grid-cols-[7.5rem_minmax(0,1fr)] ${compact ? "py-2.5" : "py-3"}`}>
      <p className="tabular font-mono text-[11.5px] leading-6 text-ink-3" title={`${SOURCE_LABEL[source] ?? source} record ${externalId}`}>
        {SOURCE_CODE[source] ?? source} {externalId.length > 10 ? `…${externalId.slice(-8)}` : externalId}
      </p>
      <div className="min-w-0">
        <ExternalLink href={url} source={source} className="text-[14px] leading-snug font-medium text-ink">
          {title}
        </ExternalLink>
        <p className="mt-0.5 flex flex-wrap gap-x-2.5 text-[12.5px] text-ink-3">
          <span>{SOURCE_LABEL[source] ?? source}</span>
          {postedAt && <span>{fmtDate(postedAt)}</span>}
          {unresolved !== undefined && <StatusText unresolved={unresolved} />}
          {severity ? <span className="tabular">Severity {severity}/5</span> : null}
        </p>
        {detail}
      </div>
    </div>
  );
}

/** A link to an original discussion. Invalid URLs render as text, never as a substitute link. */
export function ExternalLink({
  href,
  source,
  children,
  className = "",
}: {
  href: string;
  source?: string;
  children: React.ReactNode;
  className?: string;
}) {
  let ok = false;
  try {
    ok = new URL(href).protocol === "https:";
  } catch {
    ok = false;
  }
  if (!ok) {
    return (
      <span className={className}>
        {children} <span className="text-[12px] font-normal text-ink-3">(link unavailable)</span>
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`group decoration-line-strong underline-offset-[3px] [overflow-wrap:anywhere] hover:underline ${className}`}
      data-source={source}
    >
      {children}
      <ArrowUpRight
        aria-hidden
        size={13}
        strokeWidth={2}
        className="ml-0.5 inline align-[-1px] text-ink-3 transition-colors group-hover:text-accent"
      />
      <span className="sr-only"> (opens the original discussion in a new tab)</span>
    </a>
  );
}

export function SourceHealthIcon({ outcome }: { outcome: "ok" | "partial" | "failed" }) {
  if (outcome === "ok") return <CheckCircle2 aria-hidden size={14} strokeWidth={2} className="text-good" />;
  if (outcome === "partial") return <AlertTriangle aria-hidden size={14} strokeWidth={2} className="text-warn" />;
  return <XCircle aria-hidden size={14} strokeWidth={2} className="text-bad" />;
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-dashed border-line-strong bg-surface/60 px-4 py-4">
      <CircleDashed aria-hidden size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink-3" />
      <div className="min-w-0">
        <p className="text-[14px] font-medium text-ink">{title}</p>
        {children && <div className="mt-0.5 text-[13.5px] text-ink-2">{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-[13.5px] font-medium text-accent underline-offset-[3px] hover:underline">
      {children}
    </Link>
  );
}

/** Thin bar for a 0..1 share. */
export function ShareBar({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="h-1 rounded-full bg-surface-2" role="img" aria-label={label}>
      <div className="h-1 rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * One lifecycle state on a fixed scale: new, rising, steady, falling,
 * too few to compare. The word carries the meaning; the icon only echoes it.
 * Counts are always shown beside it so HN-only data is never mistaken for
 * the all-source mention count.
 */
export function LifecycleState({
  trend,
  changePct,
  thisWeek,
  lastWeek,
  showCounts = true,
}: {
  trend: "up" | "down" | "flat" | "new" | "low_data" | "no_data";
  changePct: number | null;
  thisWeek: number | null;
  lastWeek: number | null;
  showCounts?: boolean;
}) {
  const label = { new: "new", up: "rising", flat: "steady", down: "falling", low_data: "too few to compare", no_data: "no data" }[trend];
  const Icon = { new: Sparkle, up: TrendingUp, flat: MoveRight, down: TrendingDown, low_data: CircleDashed, no_data: CircleDashed }[trend];
  const strong = trend === "up" || trend === "new" || trend === "down";
  return (
    <span className="tabular inline-flex flex-wrap items-center gap-x-1.5">
      {showCounts && thisWeek !== null && lastWeek !== null && (
        <span className="text-ink-2">
          {lastWeek} → {thisWeek}
        </span>
      )}
      <span className={`inline-flex items-center gap-1 ${strong ? "font-medium text-ink" : "text-ink-3"}`}>
        <Icon aria-hidden size={13} strokeWidth={2} />
        {label}
        {changePct !== null && trend !== "new" && trend !== "low_data" && <span>{Math.abs(changePct)}%</span>}
      </span>
    </span>
  );
}
