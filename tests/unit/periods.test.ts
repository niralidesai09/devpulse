import { describe, expect, it } from "vitest";
import { inPeriod, latestCompletePeriod, localMidnightUtc, partialPeriod, periodSeries, previousPeriod, tzOffsetMs } from "@/lib/time/periods";

const IST = "Asia/Kolkata";
const FRIDAY = 5;

describe("timezone helpers", () => {
  it("knows IST is UTC+05:30", () => {
    expect(tzOffsetMs(new Date("2026-10-11T00:00:00Z"), IST)).toBe(5.5 * 3600_000);
  });
  it("computes local midnight in UTC", () => {
    expect(localMidnightUtc({ y: 2026, m: 10, d: 9 }, IST).toISOString()).toBe("2026-10-08T18:30:00.000Z");
  });
  it("handles DST zones (New York, day after the November change)", () => {
    expect(localMidnightUtc({ y: 2026, m: 11, d: 2 }, "America/New_York").toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(localMidnightUtc({ y: 2026, m: 10, d: 31 }, "America/New_York").toISOString()).toBe("2026-10-31T04:00:00.000Z");
  });
});

describe("reporting weeks (Friday 00:00 IST boundaries)", () => {
  it("on Sunday 11 Oct 2026 the latest complete week is Fri 2 Oct → Fri 9 Oct (IST)", () => {
    const p = latestCompletePeriod(new Date("2026-10-11T10:00:00Z"), IST, FRIDAY);
    expect(p.start.toISOString()).toBe("2026-10-01T18:30:00.000Z");
    expect(p.end.toISOString()).toBe("2026-10-08T18:30:00.000Z");
    expect(p.label).toBe("2 Oct – 8 Oct 2026");
  });

  it("on Friday 08:00 IST the week that ended at 00:00 that morning is complete", () => {
    const friday8am = new Date("2026-10-09T02:30:00Z"); // = 08:00 IST, the cron time
    expect(latestCompletePeriod(friday8am, IST, FRIDAY).end.toISOString()).toBe("2026-10-08T18:30:00.000Z");
  });

  it("one minute before Friday midnight IST still reports the previous week", () => {
    const thu2359 = new Date("2026-10-08T18:29:00Z");
    expect(latestCompletePeriod(thu2359, IST, FRIDAY).end.toISOString()).toBe("2026-10-01T18:30:00.000Z");
  });

  it("the previous week is the 7 days immediately before, with no gap or overlap", () => {
    const cur = latestCompletePeriod(new Date("2026-10-11T10:00:00Z"), IST, FRIDAY);
    const prev = previousPeriod(cur, IST);
    expect(prev.end.getTime()).toBe(cur.start.getTime());
    expect(cur.end.getTime() - cur.start.getTime()).toBe(7 * 86_400_000);
    expect(prev.end.getTime() - prev.start.getTime()).toBe(7 * 86_400_000);
  });

  it("builds a contiguous series oldest-first", () => {
    const cur = latestCompletePeriod(new Date("2026-10-11T10:00:00Z"), IST, FRIDAY);
    const s = periodSeries(cur, 4, IST);
    expect(s).toHaveLength(4);
    for (let i = 1; i < s.length; i++) expect(s[i].start.getTime()).toBe(s[i - 1].end.getTime());
    expect(s[3]).toEqual(cur);
  });

  it("periods are half-open [start, end)", () => {
    const cur = latestCompletePeriod(new Date("2026-10-11T10:00:00Z"), IST, FRIDAY);
    expect(inPeriod(cur.start, cur)).toBe(true);
    expect(inPeriod(cur.end, cur)).toBe(false);
    expect(inPeriod(new Date(cur.end.getTime() - 1), cur)).toBe(true);
  });

  it("labels the in-progress week as partial", () => {
    const p = partialPeriod(new Date("2026-10-11T10:00:00Z"), IST, FRIDAY);
    expect(p.start.toISOString()).toBe("2026-10-08T18:30:00.000Z");
    expect(p.label).toContain("in progress");
    expect(p.fractionElapsed).toBeGreaterThan(0);
    expect(p.fractionElapsed).toBeLessThan(1);
  });
});
