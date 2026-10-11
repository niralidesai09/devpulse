// Reporting windows.
//
// Rules (documented in docs/ARCHITECTURE.md → "Reporting windows"):
//   * All timestamps are stored and compared in UTC.
//   * A reporting week is 7 local calendar days in REPORT_TIMEZONE, from
//     local midnight to local midnight, half-open: [start, end).
//   * Weeks end at local midnight at the start of REPORT_WEEK_END_DAY
//     (Friday by default), so the Friday-morning brief covers a COMPLETE week.
//   * "Current period" in a report = the latest COMPLETE week.
//     "Previous period" = the 7 local days immediately before it.
//   * The in-progress week is only ever shown labelled as partial.
//
// Works for any IANA timezone, including ones with daylight saving time,
// because boundaries are computed from local calendar dates, not by
// subtracting fixed 24-hour blocks.

export type Period = {
  start: Date; // inclusive (UTC instant)
  end: Date; // exclusive (UTC instant)
  label: string; // e.g. "2 Oct – 8 Oct 2026"
};

const DAY_MS = 86_400_000;

type LocalDate = { y: number; m: number; d: number }; // m: 1-12

/** The calendar date (and weekday) that `instant` falls on in `tz`. */
export function localDateOf(instant: Date, tz: string): LocalDate & { weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const y = get("year");
  const m = get("month");
  const d = get("day");
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, weekday };
}

/** Offset of `tz` from UTC at `instant`, in milliseconds (IST → +19 800 000). */
export function tzOffsetMs(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** UTC instant of local midnight (00:00) on the given local calendar date in `tz`. */
export function localMidnightUtc(date: LocalDate, tz: string): Date {
  const guess = Date.UTC(date.y, date.m - 1, date.d);
  // Two passes handle the rare case where the offset differs at the guess vs the answer (DST).
  let instant = guess - tzOffsetMs(new Date(guess), tz);
  instant = guess - tzOffsetMs(new Date(instant), tz);
  return new Date(instant);
}

/** Add whole calendar days to a local date. */
function addDays(date: LocalDate, days: number): LocalDate {
  const t = new Date(Date.UTC(date.y, date.m - 1, date.d) + days * DAY_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** "2 Oct – 8 Oct 2026" — the last INCLUDED local day is end − 1 day. */
export function formatPeriodLabel(start: Date, end: Date, tz: string): string {
  const fmt = (d: Date, withYear: boolean) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      day: "numeric",
      month: "short",
      ...(withYear ? { year: "numeric" } : {}),
    }).format(d);
  const lastIncluded = new Date(end.getTime() - 1);
  return `${fmt(start, false)} – ${fmt(lastIncluded, true)}`;
}

function makePeriod(startLocal: LocalDate, endLocal: LocalDate, tz: string): Period {
  const start = localMidnightUtc(startLocal, tz);
  const end = localMidnightUtc(endLocal, tz);
  return { start, end, label: formatPeriodLabel(start, end, tz) };
}

/**
 * The latest COMPLETE reporting week at `now`.
 * Example (tz Asia/Kolkata, week ends Friday): on Sunday 11 Oct 2026 it is
 * Fri 2 Oct 00:00 IST → Fri 9 Oct 00:00 IST.
 * On a Friday the week that ended at 00:00 that same morning is returned.
 */
export function latestCompletePeriod(now: Date, tz: string, weekEndDay: number): Period {
  const today = localDateOf(now, tz);
  const daysSinceEnd = (today.weekday - weekEndDay + 7) % 7;
  const endLocal = addDays(today, -daysSinceEnd);
  return makePeriod(addDays(endLocal, -7), endLocal, tz);
}

/** The week immediately before `period` (same length, in local days). */
export function previousPeriod(period: Period, tz: string): Period {
  const endLocal = localDateOf(period.start, tz);
  return makePeriod(addDays(endLocal, -7), endLocal, tz);
}

/** `count` consecutive complete weeks ending with `latest`, oldest first. */
export function periodSeries(latest: Period, count: number, tz: string): Period[] {
  const out: Period[] = [latest];
  while (out.length < count) out.unshift(previousPeriod(out[0], tz));
  return out;
}

/** The in-progress week: from the end of the latest complete week until `now`. */
export function partialPeriod(now: Date, tz: string, weekEndDay: number): Period & { fractionElapsed: number } {
  const latest = latestCompletePeriod(now, tz, weekEndDay);
  const start = latest.end;
  const endLocal = addDays(localDateOf(start, tz), 7);
  const fullEnd = localMidnightUtc(endLocal, tz);
  const fractionElapsed = (now.getTime() - start.getTime()) / (fullEnd.getTime() - start.getTime());
  return { start, end: now, label: `${formatPeriodLabel(start, fullEnd, tz)} (in progress)`, fractionElapsed };
}

/** Is `instant` inside [start, end)? */
export function inPeriod(instant: Date, period: Pick<Period, "start" | "end">): boolean {
  const t = instant.getTime();
  return t >= period.start.getTime() && t < period.end.getTime();
}
