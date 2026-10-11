// Display formatting. Dates are shown in the reporting timezone and always labelled.

import { REPORT_TIMEZONE } from "@/lib/config";
import type { TrendStatus } from "@/lib/analytics/metrics";

export const TZ_LABEL = REPORT_TIMEZONE === "Asia/Kolkata" ? "IST" : REPORT_TIMEZONE;

export function fmtDate(iso: string | null | undefined, opts: { year?: boolean } = {}): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: REPORT_TIMEZONE,
    day: "numeric",
    month: "short",
    ...(opts.year ? { year: "numeric" } : {}),
  }).format(new Date(iso));
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${new Intl.DateTimeFormat("en-GB", {
    timeZone: REPORT_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso))} ${TZ_LABEL}`;
}

export function fmtRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function fmtPct(p: number | null): string {
  if (p === null) return "—";
  return `${p > 0 ? "+" : ""}${p}%`;
}

export function fmtSigned(n: number): string {
  return `${n > 0 ? "+" : ""}${n}`;
}

export function fmtDuration(ms: number | null | undefined): string {
  if (!ms && ms !== 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  return s < 90 ? `${s.toFixed(1)} s` : `${Math.round(s / 60)} min`;
}

export const SOURCE_LABELS: Record<string, string> = {
  hackernews: "Hacker News",
  github: "GitHub Issues",
  stackoverflow: "Stack Overflow",
  devto: "DEV Community",
};
export const SOURCE_ORDER = ["hackernews", "github", "stackoverflow", "devto"];
export const sourceLabel = (id: string) => SOURCE_LABELS[id] ?? id;

/** Fixed colour per source (follows the entity, never its rank). */
export const sourceColorVar = (id: string) => {
  const i = SOURCE_ORDER.indexOf(id);
  return i >= 0 ? `var(--series-${i + 1})` : "var(--series-ref)";
};

export const TREND_LABELS: Record<TrendStatus, string> = {
  new: "New",
  growing: "Growing",
  stable: "Stable",
  declining: "Declining",
  gone: "Not seen",
  insufficient_data: "Too few to call",
};

export const TREND_HELP: Record<TrendStatus, string> = {
  new: "Seen this week, not in the previous week. No percentage: the baseline is zero.",
  growing: "Up by at least 2 discussions and 25% versus the previous week.",
  stable: "Change smaller than 2 discussions or 25%.",
  declining: "Down by at least 2 discussions and 25% versus the previous week.",
  gone: "Seen in the previous week, not this week.",
  insufficient_data: "Fewer than 4 discussions across both weeks — too few to call a trend.",
};

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
