import { test } from "node:test";
import assert from "node:assert/strict";
import { countDays, todayInZone, parseDay, requiredYears } from "../src/lib/dates";
import { validateEvent, selectEvent, type CountdownEvent } from "../src/lib/model";

const defaults = { mode: "calendar" as const, includeToday: false, includeTarget: true };
const holidays = new Map([
  ["2026-09-20", false],
  ["2026-09-25", true],
]);

test("counts 11 calendar days and 9 workdays including Sunday make-up work", () => {
  assert.equal(countDays("2026-09-14", "2026-09-25", defaults, holidays), 11);
  assert.equal(countDays("2026-09-14", "2026-09-25", { ...defaults, mode: "workday" }, holidays), 9);
});

test("same day requires both endpoints and is counted at most once", () => {
  for (const [includeToday, includeTarget, expected] of [
    [false, false, 0],
    [true, false, 0],
    [false, true, 0],
    [true, true, 1],
  ] as const) {
    assert.equal(countDays("2026-09-14", "2026-09-14", { ...defaults, includeToday, includeTarget }), expected);
  }
  assert.equal(
    countDays("2026-09-25", "2026-09-25", { mode: "workday", includeToday: true, includeTarget: true }, holidays),
    0,
  );
});

test("respects all endpoint options on distinct dates", () => {
  for (const [includeToday, includeTarget, expected] of [
    [false, false, 1],
    [true, false, 2],
    [false, true, 2],
    [true, true, 3],
  ] as const) {
    assert.equal(countDays("2026-09-14", "2026-09-16", { ...defaults, includeToday, includeTarget }), expected);
  }
});

test("handles leap day, year boundary, expired events and weekend fallback", () => {
  assert.equal(countDays("2028-02-28", "2028-03-01", defaults), 2);
  assert.equal(countDays("2026-12-31", "2027-01-01", defaults), 1);
  assert.equal(countDays("2026-09-14", "2026-09-13", defaults), 0);
  assert.equal(countDays("2026-09-18", "2026-09-21", { ...defaults, mode: "workday" }), 1);
});

test("rejects impossible and ambiguous dates instead of normalizing them", () => {
  for (const date of [
    "2026-02-29",
    "2026-13-01",
    "2026-04-31",
    "26-09-14",
    "2026-9-14",
    "2026-09-14T00:00:00Z",
    "0000-01-01",
  ]) {
    assert.throws(() => parseDay(date));
  }
});

test("today uses the selected time zone and day arithmetic ignores DST", () => {
  const now = new Date("2026-09-14T00:30:00Z");
  assert.equal(todayInZone("Asia/Shanghai", now), "2026-09-14");
  assert.equal(todayInZone("America/Los_Angeles", now), "2026-09-13");
  assert.equal(countDays("2026-03-07", "2026-03-09", defaults), 2);
});

test("loads the following year's bulletin only where December can be affected", () => {
  assert.deepEqual(requiredYears("2026-09-14", "2026-09-25", defaults), [2026]);
  assert.deepEqual(requiredYears("2026-12-30", "2027-01-02", defaults), [2026, 2027]);
  assert.deepEqual(requiredYears("2026-12-01", "2026-12-31", defaults), [2026, 2027]);
  assert.deepEqual(requiredYears("2026-09-14", "2026-09-13", defaults), []);
});

const event = (id: string, targetDate: string): CountdownEvent => ({ id, title: id, targetDate, ...defaults });
test("selects upcoming by date, honors a fixed expired event and recovers from removed pins", () => {
  const events = [event("later", "2026-10-01"), event("past", "2026-09-01"), event("next", "2026-09-15")];
  assert.equal(selectEvent(events, undefined, "2026-09-14")?.id, "next");
  assert.equal(selectEvent(events, "past", "2026-09-14")?.id, "past");
  assert.equal(selectEvent(events, "removed", "2026-09-14")?.id, "next");
  assert.equal(selectEvent([events[1]], undefined, "2026-09-14"), undefined);
});

test("validates stored event schema and trims titles", () => {
  assert.equal(validateEvent({ ...event("test", "2026-09-15"), title: "  出发  " }).title, "出发");
  for (const invalid of [
    { title: " " },
    { mode: "unknown" },
    { includeToday: "false" },
    { id: "" },
    { targetDate: "2026-02-30" },
  ]) {
    assert.throws(() => validateEvent({ ...event("test", "2026-09-15"), ...invalid }));
  }
});

test("rejects targets beyond twenty calendar years", () => {
  assert.throws(() => countDays("2026-09-14", "2046-09-15", defaults), /20 年/);
  assert.equal(countDays("2026-09-14", "2046-09-14", defaults), 7305);
});
