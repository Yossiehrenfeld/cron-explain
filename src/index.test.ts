import { describe, it, expect } from "vitest";
import { parse, explain, next, matches, CronParseError } from "./index.js";

describe("parse", () => {
  it("expands stars, steps, ranges, lists and names", () => {
    const c = parse("*/15 9-17 1,15 JAN-MAR MON-FRI");
    expect(c.minute).toEqual([0, 15, 30, 45]);
    expect(c.hour).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(c.dayOfMonth).toEqual([1, 15]);
    expect(c.month).toEqual([1, 2, 3]);
    expect(c.dayOfWeek).toEqual([1, 2, 3, 4, 5]);
  });
  it("treats 7 as Sunday", () => {
    expect(parse("0 0 * * 7").dayOfWeek).toEqual([0]);
  });
  it("expands aliases", () => {
    expect(parse("@hourly").expression).toBe("0 * * * *");
    expect(parse("@weekly").dayOfWeek).toEqual([0]);
  });
  it("rejects bad input", () => {
    expect(() => parse("* * * *")).toThrow(CronParseError);
    expect(() => parse("60 * * * *")).toThrow(/out of range/);
    expect(() => parse("* * * * 8")).toThrow(/out of range/);
    expect(() => parse("5-1 * * * *")).toThrow(/backwards/);
    expect(() => parse("*/0 * * * *")).toThrow(/Invalid step/);
    expect(() => parse("* * * FOO *")).toThrow(/Invalid value/);
  });
});

describe("explain", () => {
  const cases: [string, string][] = [
    ["* * * * *", "Every minute."],
    ["*/5 * * * *", "Every 5 minutes."],
    ["0 * * * *", "At minute 0 past every hour."],
    ["30 9 * * *", "At 09:30."],
    ["0 9 * * 1-5", "At 09:00 on Monday through Friday."],
    ["*/15 9-17 * * 1-5", "Every 15 minutes past hour 9 through 17 on Monday through Friday."],
    ["0 0 1 * *", "At 00:00 on day-of-month 1."],
    ["0 0 1,15 * *", "At 00:00 on day-of-month 1 and 15."],
    ["0 12 * * SAT,SUN", "At 12:00 on Sunday and Saturday."],
    ["0 8 1 1 *", "At 08:00 on day-of-month 1 in January."],
    ["0 8 * 6-8 *", "At 08:00 in June through August."],
    ["0 8 1 * MON", "At 08:00 on day-of-month 1 or on Monday."],
    ["@daily", "At 00:00."],
    ["0,30 8,12,18 * * *", "At minute 0 and 30 past hour 8, 12, and 18."],
    ["5,35 8,12,18 * * *", "At minute 5 and 35 past hour 8, 12, and 18."],
    ["* 9 * * *", "Every minute past hour 9."],
  ];
  for (const [expr, text] of cases) {
    it(`${expr} -> ${text}`, () => expect(explain(expr)).toBe(text));
  }
});

describe("next (utc)", () => {
  const from = new Date("2026-10-21T21:07:30Z");
  it("finds the next minute boundary", () => {
    expect(next("* * * * *", { from, utc: true })[0].toISOString()).toBe("2026-10-21T21:08:00.000Z");
  });
  it("finds a daily time tomorrow when today's has passed", () => {
    expect(next("0 9 * * *", { from, utc: true })[0].toISOString()).toBe("2026-10-22T09:00:00.000Z");
  });
  it("respects weekdays", () => {
    // 2026-10-21 is a Wednesday; Friday 17:00 is the first match
    expect(next("0 17 * * FRI", { from, utc: true })[0].toISOString()).toBe("2026-10-23T17:00:00.000Z");
  });
  it("jumps months", () => {
    const [a, b] = next("0 0 1 * *", { from, count: 2, utc: true });
    expect(a.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(b.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });
  it("uses OR when both day fields are restricted", () => {
    // Nov 1 2026 is a Sunday; "1st of month or Monday": Oct 26 (Mon) comes first
    expect(next("0 0 1 * MON", { from, utc: true })[0].toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });
  it("returns the requested count in order", () => {
    const runs = next("*/20 * * * *", { from, count: 4, utc: true }).map((d) => d.toISOString());
    expect(runs).toEqual(["2026-10-21T21:20:00.000Z", "2026-10-21T21:40:00.000Z", "2026-10-21T22:00:00.000Z", "2026-10-21T22:20:00.000Z"]);
  });
  it("handles Feb 29 only in leap years", () => {
    expect(next("0 0 29 2 *", { from, utc: true })[0].toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });
  it("returns an empty array when nothing matches within 5 years", () => {
    expect(next("0 0 31 2 *", { from, utc: true })).toEqual([]);
  });
});

describe("matches", () => {
  it("checks an instant", () => {
    expect(matches("30 9 * * *", new Date("2026-10-21T09:30:59Z"), true)).toBe(true);
    expect(matches("30 9 * * *", new Date("2026-10-21T09:31:00Z"), true)).toBe(false);
  });
});
