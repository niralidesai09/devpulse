// Shared, server-safe UI primitives. One place for typography, spacing,
// borders and states, so every page looks and behaves the same.

import Link from "next/link";
import type { ReactNode } from "react";
import type { TrendStatus } from "@/lib/analytics/metrics";
import { isSafeHttpUrl } from "@/lib/text";
import { sourceColorVar, sourceLabel, TREND_HELP, TREND_LABELS } from "@/lib/format";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium text-text-3">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold tracking-tight text-text">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-text-2">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ children, className, as: As = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" }) {
  return <As className={cx("rounded-lg border border-border bg-surface shadow-[var(--shadow-sm)]", className)}>{children}</As>;
}

export function CardHeader({
  title,
  description,
  actions,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h2 id={id} className="text-sm font-semibold text-text">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-xs text-text-3">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("p-4", className)}>{children}</div>;
}

// ---------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------

export function Stat({
  label,
  value,
  hint,
  sub,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  sub?: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface px-4 py-3 shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-1 text-xs font-medium text-text-3">
        {label}
        {hint && <InfoTip text={hint} />}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-text">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-text-3">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------

type Tone = "neutral" | "accent" | "good" | "warn" | "bad" | "info";
const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-text-2 border-border",
  accent: "bg-accent-soft text-accent-text border-transparent",
  good: "bg-good-soft text-good border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  bad: "bg-bad-soft text-bad border-transparent",
  info: "bg-info-soft text-info border-transparent",
};

export function Badge({ children, tone = "neutral", title, className }: { children: ReactNode; tone?: Tone; title?: string; className?: string }) {
  return (
    <span
      title={title}
      className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium leading-4", TONES[tone], className)}
    >
      {children}
    </span>
  );
}

const TREND_TONE: Record<TrendStatus, Tone> = {
  new: "info",
  growing: "warn",
  stable: "neutral",
  declining: "good",
  gone: "neutral",
  insufficient_data: "neutral",
};
const TREND_ICON: Record<TrendStatus, string> = {
  new: "✦",
  growing: "▲",
  stable: "→",
  declining: "▼",
  gone: "○",
  insufficient_data: "·",
};

/** Trend label: icon + text + tooltip — never colour alone. Growing pain is "warn", fading pain is "good". */
export function TrendBadge({ status }: { status: TrendStatus }) {
  return (
    <Badge tone={TREND_TONE[status]} title={TREND_HELP[status]}>
      <span aria-hidden>{TREND_ICON[status]}</span>
      {TREND_LABELS[status]}
    </Badge>
  );
}

export function SourceBadge({ source }: { source: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-text-2">
      <span aria-hidden className="size-2 rounded-full" style={{ background: sourceColorVar(source) }} />
      {sourceLabel(source)}
    </span>
  );
}

export function AiBadge({ title = "Interpretation generated by Gemini Flash — not the author's words" }: { title?: string }) {
  return (
    <Badge tone="accent" title={title}>
      AI
    </Badge>
  );
}

// ---------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
const BUTTON: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover border-transparent",
  secondary: "bg-surface text-text border-border-strong hover:bg-surface-2",
  ghost: "bg-transparent text-text-2 border-transparent hover:bg-surface-2 hover:text-text",
  danger: "bg-surface text-bad border-border-strong hover:bg-bad-soft",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: "sm" | "md" = "md") {
  return cx(
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
    BUTTON[variant],
  );
}

export function ButtonLink({ href, children, variant = "secondary", size = "md" }: { href: string; children: ReactNode; variant?: ButtonVariant; size?: "sm" | "md" }) {
  return (
    <Link href={href} className={buttonClass(variant, size)}>
      {children}
    </Link>
  );
}

export const inputClass =
  "h-8 w-full rounded-md border border-border-strong bg-surface px-2.5 text-sm text-text placeholder:text-text-3 focus:border-accent focus:outline-none";

// ---------------------------------------------------------------------
// States
// ---------------------------------------------------------------------

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-border-strong bg-surface-2/50 px-4 py-6">
      <p className="text-sm font-medium text-text">{title}</p>
      {children && <div className="max-w-2xl text-sm text-text-2">{children}</div>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function Callout({ tone = "info", title, children }: { tone?: "info" | "warn" | "bad" | "good"; title?: string; children: ReactNode }) {
  const styles = {
    info: "border-info/25 bg-info-soft text-text",
    warn: "border-warn/30 bg-warn-soft text-text",
    bad: "border-bad/30 bg-bad-soft text-text",
    good: "border-good/30 bg-good-soft text-text",
  }[tone];
  const icon = { info: "i", warn: "!", bad: "×", good: "✓" }[tone];
  const iconTone = { info: "bg-info", warn: "bg-warn", bad: "bg-bad", good: "bg-good" }[tone];
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cx("flex gap-3 rounded-md border px-3 py-2.5 text-sm", styles)}>
      <span aria-hidden className={cx("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white", iconTone)}>
        {icon}
      </span>
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        <div className="text-text-2">{children}</div>
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
  return <div className={cx("animate-pulse rounded-md bg-surface-3", className)} />;
}

export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-4">
      <Skeleton className="h-7 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-48" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------

/** Accessible hover/focus tooltip using the native title plus a visible "i". */
export function InfoTip({ text }: { text: string }) {
  return (
    <span
      tabIndex={0}
      role="img"
      aria-label={text}
      title={text}
      className="inline-flex size-3.5 cursor-help items-center justify-center rounded-full border border-border-strong text-[9px] font-semibold text-text-3"
    >
      i
    </span>
  );
}

/** External link to an original source — only http(s), opened safely. */
export function SourceLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  if (!isSafeHttpUrl(href)) return <span className={className}>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={cx("hover:underline", className)}>
      {children}
      <span aria-hidden className="ml-0.5 text-text-3">
        ↗
      </span>
      <span className="sr-only"> (opens original source in a new tab)</span>
    </a>
  );
}

/** Tiny inline sparkline (SVG) for weekly counts. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const w = 64;
  const h = 18;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label}: ${values.join(", ")} per week`} className="overflow-visible">
      <title>{`${label}: ${values.join(" → ")} (oldest → current week)`}</title>
      <polyline points={pts} fill="none" stroke="var(--series-1)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {values.length > 0 && (
        <circle cx={(values.length - 1) * step} cy={h - 2 - (values[values.length - 1] / max) * (h - 4)} r={2} fill="var(--series-1)" />
      )}
    </svg>
  );
}

/** Horizontal proportion bar (for tables). */
export function MiniBar({ value, max, color = "var(--series-1)" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-surface-3" aria-hidden>
      {value > 0 && <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: color }} />}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-border-strong bg-surface-2 px-1 font-mono text-[11px]">{children}</kbd>;
}
