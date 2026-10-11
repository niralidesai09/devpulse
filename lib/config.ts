// Central settings. Anything a PM might want to tune without touching code
// is an env var; everything else is a documented constant.

/** Bumped whenever collection/analysis/report logic changes meaningfully. Stored on every run and report. */
export const PIPELINE_VERSION = "2.0.0";

/** Reporting timezone (IANA name). Default: India Standard Time. */
export const REPORT_TIMEZONE = process.env.REPORT_TIMEZONE || "Asia/Kolkata";

/**
 * Reporting weeks END at local midnight at the start of this weekday
 * (0 = Sunday … 5 = Friday). Default Friday: the brief that goes out on
 * Friday morning covers the 7 full days Fri 00:00 → Thu 23:59:59 local time.
 */
export const REPORT_WEEK_END_DAY = clampInt(process.env.REPORT_WEEK_END_DAY, 5, 0, 6);

/** How many complete reporting weeks each collection looks back (plus the current partial week). */
export const LOOKBACK_WEEKS = clampInt(process.env.LOOKBACK_WEEKS, 3, 2, 6);

/** Upper bound on discussions sent to Gemini in one invocation (the rest stay "pending" for the next run). */
export const MAX_ANALYZE_PER_RUN = clampInt(process.env.MAX_ANALYZE_PER_RUN, 400, 20, 2000);

/** A discussion that failed analysis this many times is left as "failed" until reprocessed manually. */
export const MAX_ANALYSIS_ATTEMPTS = 3;

/** Minimum combined (current + previous) count before we call something "growing" or "declining". */
export const MIN_TREND_SAMPLE = 4;

/** Vercel function budget (seconds) used by the pipeline routes. Hobby + Fluid compute allows 300s. */
export const FUNCTION_MAX_SECONDS = 300;

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
