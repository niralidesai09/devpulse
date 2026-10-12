// Design-system primitives (server-safe). Every page is built from these so
// typography, spacing, colour and states stay consistent.
// Tokens live in app/globals.css; rationale in docs/UX_REDESIGN.md.

import { ArrowDownRight, ArrowUpRight, ExternalLink, Info, Minus, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { TrendStatus } from "@/lib/analytics/metrics";
import { sourceColorVar, sourceLabel, TREND_HELP, TREND_LABELS } from "@/lib/format";
import { isSafeHttpUrl } from "@/lib/text";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------
// Page structure
// ---------------------------------------------------------------------

export function PageHeader({
  title,
  description,
  actions,
  meta,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-10">
      {back && (
        <Link href={back.href} className="no-print mb-4 inline-flex items-center gap-1 text-[13px] text-ink-3 transition-colors hover:text-ink">
          <span aria-hidden>←</span> {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 max-w-3xl">
          <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em] text-ink">{title}</h1>
          {description && <p className="mt-2 text-[15px] leading-6 text-ink-2">{description}</p>}
          {meta && <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-ink-3">{meta}</div>}
        </div>
        {actions && <div className="no-print flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** A titled region separated by whitespace — not a box. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={cx("min-w-0", className)} aria-labelledby={id}>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 id={id} className="text-[15px] leading-6 font-semibold text-ink">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-[13px] leading-5 text-ink-3">{description}</p>}
        </div>
        {actions && <div className="no-print flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** A quiet raised surface for grouped rows. Use sparingly. */
export function Panel({ children, className, as: As = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "article" | "ul" | "ol" }) {
  return <As className={cx("min-w-0 rounded-[var(--radius-lg)] border border-line bg-panel", className)}>{children}</As>;
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cx("border-0 border-t border-line", className)} />;
}

// ---------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------

export function Metric({
  label,
  value,
  explanation,
  comparison,
  tip,
  emphasis = false,
}: {
  label: string;
  value: ReactNode;
  explanation: string;
  comparison?: ReactNode;
  tip?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
        {label}
        {tip && <Tip text={tip} />}
      </div>
      <div className={cx("tabular mt-1 font-semibold tracking-[-0.02em] text-ink", emphasis ? "text-[40px] leading-[44px]" : "text-[28px] leading-[34px]")}>{value}</div>
      {comparison && <div className="mt-1 text-[13px] text-ink-2">{comparison}</div>}
      <p className="mt-1 text-[12px] leading-[18px] text-ink-3">{explanation}</p>
    </div>
  );
}

// ---------------------------------------------------------------------
// Labels & badges
// ---------------------------------------------------------------------

type Tone = "neutral" | "accent" | "up" | "down" | "bad" | "ok";
const TONES: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2",
  accent: "bg-accent-soft text-accent-ink",
  up: "bg-up-soft text-up",
  down: "bg-down-soft text-down",
  bad: "bg-bad-soft text-bad",
  ok: "bg-down-soft text-ok",
};

export function Badge({
  children,
  tone = "neutral",
  title,
  className,
  wrap = false,
}: {
  children: ReactNode;
  tone?: Tone;
  title?: string;
  className?: string;
  wrap?: boolean;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] leading-[18px] font-medium",
        wrap ? "whitespace-normal" : "whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const TREND_TONE: Record<TrendStatus, Tone> = {
  new: "accent",
  growing: "up",
  stable: "neutral",
  declining: "down",
  gone: "neutral",
  insufficient_data: "neutral",
};

/** Trend label: icon + word + explanation on hover. Growing problems are amber, fading ones green. */
export function TrendBadge({ status }: { status: TrendStatus }) {
  const Icon = status === "growing" ? ArrowUpRight : status === "declining" ? ArrowDownRight : status === "new" ? Sparkles : Minus;
  return (
    <Badge tone={TREND_TONE[status]} title={TREND_HELP[status]}>
      <Icon aria-hidden className="size-3.5" strokeWidth={2} />
      {TREND_LABELS[status]}
    </Badge>
  );
}

export function SourceTag({ source }: { source: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] text-ink-2">
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: sourceColorVar(source) }} />
      {sourceLabel(source)}
    </span>
  );
}

/** Marks text written by the model, so facts and interpretation are never confused. */
export function AiLabel({ children = "AI summary" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-accent-ink" title="Written by Gemini Flash from stored discussions; every claim cites its evidence">
      <Sparkles aria-hidden className="size-3.5" strokeWidth={2} />
      {children}
    </span>
  );
}

export function StatusDot({ tone }: { tone: "ok" | "warn" | "bad" | "idle" }) {
  const color = { ok: "bg-ok", warn: "bg-up", bad: "bg-bad", idle: "bg-line-strong" }[tone];
  return <span aria-hidden className={cx("inline-block size-2 shrink-0 rounded-full", color)} />;
}

export type EvidenceStrength = "Strong" | "Moderate" | "Limited";

/** Evidence quality from independent discussions and source diversity — a simple stated rule, not a probability. */
export function evidenceStrength(discussions: number, sources: number): EvidenceStrength {
  if (discussions >= 6 && sources >= 2) return "Strong";
  if (discussions >= 3) return "Moderate";
  return "Limited";
}

export function EvidenceMeter({ discussions, sources }: { discussions: number; sources: number }) {
  const s = evidenceStrength(discussions, sources);
  const filled = s === "Strong" ? 3 : s === "Moderate" ? 2 : 1;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[12px] text-ink-3"
      title={`${s} evidence: ${discussions} discussion${discussions === 1 ? "" : "s"} from ${sources} source${sources === 1 ? "" : "s"}. Strong = 6+ discussions from 2+ sources; Moderate = 3+.`}
    >
      <span aria-hidden className="flex gap-0.5">
        {[1, 2, 3].map((i) => (
          <span key={i} className={cx("h-2.5 w-1 rounded-full", i <= filled ? "bg-ink-2" : "bg-line-strong")} />
        ))}
      </span>
      {s}
    </span>
  );
}

// ---------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
const BUTTON: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover border-transparent shadow-[0_1px_0_rgba(0,0,0,0.04)]",
  secondary: "bg-panel text-ink border-line-strong hover:bg-sunken",
  ghost: "bg-transparent text-ink-2 border-transparent hover:bg-sunken hover:text-ink",
  danger: "bg-panel text-bad border-line-strong hover:bg-bad-soft",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: "sm" | "md" = "md") {
  return cx(
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border font-medium transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-3.5 text-[14px]",
    BUTTON[variant],
  );
}

export function ButtonLink({
  href,
  children,
  variant = "secondary",
  size = "md",
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md";
}) {
  return (
    <Link href={href} className={buttonClass(variant, size)}>
      {children}
    </Link>
  );
}

export const inputClass =
  "h-9 w-full rounded-[var(--radius)] border border-line-strong bg-panel px-3 text-[14px] text-ink placeholder:text-ink-3 transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15";

export const labelClass = "grid gap-1.5 text-[13px] font-medium text-ink-2";

// ---------------------------------------------------------------------
// States
// ---------------------------------------------------------------------

export function EmptyState({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[var(--radius-lg)] border border-dashed border-line-strong px-6 py-12 text-center">
      {icon && <div className="mb-3 text-ink-3">{icon}</div>}
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {children && <div className="mt-1.5 max-w-md text-[14px] leading-6 text-ink-2">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Callout({ tone = "neutral", title, children }: { tone?: "neutral" | "up" | "bad" | "ok"; title?: ReactNode; children?: ReactNode }) {
  const styles = {
    neutral: "border-line bg-sunken/60",
    up: "border-up/20 bg-up-soft",
    bad: "border-bad/20 bg-bad-soft",
    ok: "border-down/20 bg-down-soft",
  }[tone];
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cx("flex gap-3 rounded-[var(--radius)] border px-4 py-3 text-[14px]", styles)}>
      <Info aria-hidden className={cx("mt-0.5 size-4 shrink-0", tone === "bad" ? "text-bad" : tone === "up" ? "text-up" : tone === "ok" ? "text-ok" : "text-ink-3")} />
      <div className="min-w-0">
        {title && <p className="font-medium text-ink">{title}</p>}
        {children && <div className={cx("text-ink-2", Boolean(title) && "mt-0.5")}>{children}</div>}
      </div>
    </div>
  );
}

export function ErrorPanel({ title = "Something went wrong", error, hint }: { title?: string; error: string; hint?: ReactNode }) {
  return (
    <Callout tone="bad" title={title}>
      <p className="break-words">{error}</p>
      {hint && <p className="mt-1">{hint}</p>}
    </Callout>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-[var(--radius)] bg-sunken", className)} />;
}

export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-10">
      <div className="space-y-3">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-[28rem] max-w-full" />
      </div>
      <Skeleton className="h-36" />
      <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------

/** Accessible tooltip: shows on hover and keyboard focus. */
export function Tip({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <span className="group/tip relative inline-flex">
      <span tabIndex={0} aria-label={text} className="inline-flex cursor-help items-center text-ink-3 hover:text-ink-2 focus:text-ink-2">
        {children ?? <Info className="size-3.5" strokeWidth={2} aria-hidden />}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-40 mb-2 w-64 -translate-x-1/2 rounded-[var(--radius)] bg-ink px-3 py-2 text-[12px] leading-[18px] font-normal text-white opacity-0 shadow-[var(--shadow-pop)] transition-opacity duration-100 group-hover/tip:visible group-hover/tip:opacity-100 group-focus-within/tip:visible group-focus-within/tip:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

/** External link to an original source — http(s) only, opened safely, marked with an icon. */
export function SourceLink({ href, children, className }: { href: string; children?: ReactNode; className?: string }) {
  if (!isSafeHttpUrl(href)) return <span className={className}>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={cx("group/link hover:text-accent-ink", className)}>
      {children}
      <ExternalLink aria-hidden className="ml-1 inline size-3.5 align-[-2px] text-ink-3 group-hover/link:text-accent-ink" />
      <span className="sr-only"> (opens the original in a new tab)</span>
    </a>
  );
}

/** Paired bars: this week vs last week, on a shared scale. */
export function PairBar({ current, previous, max }: { current: number; previous: number; max: number }) {
  const w = (n: number) => (max > 0 && n > 0 ? `${Math.max(3, (n / max) * 100)}%` : "0%");
  return (
    <div className="grid gap-1" aria-hidden>
      <div className="h-1.5 rounded-full bg-sunken">
        <div className="h-1.5 rounded-full bg-[var(--bar-current)]" style={{ width: w(current) }} />
      </div>
      <div className="h-1.5 rounded-full bg-sunken">
        <div className="h-1.5 rounded-full bg-[var(--bar-previous)]" style={{ width: w(previous) }} />
      </div>
    </div>
  );
}

/** Tiny inline sparkline (weekly counts, oldest → newest). */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const w = 56;
  const h = 18;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const y = (v: number) => (h - 2 - (v / max) * (h - 4)).toFixed(1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${y(v)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label}: ${values.join(", ")} per week`} className="overflow-visible">
      <title>{`${values.join(" → ")} discussions per week (oldest → latest)`}</title>
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {values.length > 0 && <circle cx={(values.length - 1) * step} cy={y(values[values.length - 1])} r={2} fill="var(--accent)" />}
    </svg>
  );
}
