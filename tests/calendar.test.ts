import { test } from "node:test";
import assert from "node:assert/strict";
import {
  monthCells,
  shiftMonth,
  describeDay,
  calendarYears,
  visibleCalendarYears,
  dayAppearance,
} from "../src/lib/calendar";
import { selectionOptions } from "../src/lib/selection";
import { emptyCalendar, loadCalendar } from "../src/lib/holidays";
import { MemoryStore } from "./support";

const event = {
  id: "test",
  title: "测试",
  targetDate: "2026-10-22",
  mode: "workday" as const,
  includeToday: false,
  includeTarget: true,
};
const fixture = {
  year: 2026,
  papers: ["https://www.gov.cn/notice"],
  days: [
    { date: "2026-09-20", name: "国庆节", isOffDay: false },
    { date: "2026-09-25", name: "中秋节", isOffDay: true },
    ...[1, 2, 3, 4, 5, 6, 7].map((day) => ({ date: `2026-10-0${day}`, name: "国庆节", isOffDay: true })),
    { date: "2026-10-10", name: "国庆节", isOffDay: false },
  ],
};

test("month cells align Monday first, include leap day and complete whole weeks", () => {
  const cells = monthCells("2026-09");
  assert.equal(cells.length, 35);
  assert.equal(cells[0], "2026-08-31");
  assert.equal(cells[1], "2026-09-01");
  assert.equal(cells[30], "2026-09-30");
  assert.equal(cells[34], "2026-10-04");
  assert.equal(monthCells("2027-01")[0], "2026-12-28");
  assert.deepEqual(visibleCalendarYears("2027-01"), [2026, 2027]);
  assert.equal(monthCells("2199-12").at(-1), null);
  assert.ok(monthCells("2028-02").includes("2028-02-29"));
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
});

test("date explanations match countdown: explicit holidays and make-up work override weekdays", async () => {
  const calendar = await loadCalendar([2026], new MemoryStore(), async () => fixture, 1234);
  assert.equal(describeDay("2026-09-20", calendar, "2026-09-14", event).kind, "makeup");
  assert.equal(describeDay("2026-09-20", calendar, "2026-09-14", event).counted, true);
  assert.equal(describeDay("2026-09-25", calendar, "2026-09-14", event).counted, false);
  assert.equal(describeDay("2026-09-19", calendar, "2026-09-14", event).kind, "weekend");
  assert.equal(describeDay("2026-09-14", calendar, "2026-09-14", event).inRange, false);
  let included = 0;
  for (const month of ["2026-09", "2026-10"])
    for (const day of monthCells(month))
      if (day?.startsWith(month) && describeDay(day, calendar, "2026-09-14", event).counted) included++;
  assert.equal(included, 24);
  assert.equal(describeDay("2026-10-22", calendar, "2026-09-14", { ...event, includeTarget: false }).counted, false);
  assert.equal(describeDay("2026-09-25", calendar, "2026-09-14", { ...event, mode: "calendar" }).counted, true);
});

test("day appearance distinguishes rest days, counted dates, excluded endpoints and adjacent months", async () => {
  const calendar = await loadCalendar([2026], new MemoryStore(), async () => fixture, 1234);
  const appearance = (date: string, current = event) =>
    dayAppearance(date, describeDay(date, calendar, "2026-09-14", current), "2026-09");
  assert.equal(appearance("2026-09-19").color, appearance("2026-09-25").color);
  assert.notEqual(appearance("2026-09-20").color, appearance("2026-09-19").color);
  assert.equal(appearance("2026-09-21").status, "✓ 计入");
  assert.equal(appearance("2026-09-25").status, "− 不计");
  assert.notEqual(appearance("2026-09-21").background, appearance("2026-09-25").background);
  assert.equal(appearance("2026-09-14").status, "今天不计");
  assert.equal(appearance("2026-10-22", { ...event, includeTarget: false }).status, "目标日不计");
  assert.equal(appearance("2026-10-01").adjacent, true);
  const natural = describeDay("2026-09-25", calendar, "2026-09-14", { ...event, mode: "calendar" });
  assert.equal(dayAppearance("2026-09-25", natural, "2026-09").status, "✓ 计入");
  assert.equal(dayAppearance("2026-09-25", natural, "2026-09").color, appearance("2026-09-25").color);
  const unknown = describeDay("2027-01-04", emptyCalendar(), "2026-09-14", { ...event, targetDate: "2027-01-04" });
  assert.match(dayAppearance("2027-01-04", unknown, "2027-01").status, /≈/);
});

test("unknown calendars never label weekday rules as confirmed holiday information", () => {
  const day = describeDay("2027-01-04", emptyCalendar(), "2026-09-14");
  assert.equal(day.uncertain, true);
  assert.match(day.description, /未确认/);
  assert.deepEqual(calendarYears("2026-12"), [2026, 2027]);
});

test("calendar exposes actual cached bulletin metadata, including failed refresh status", async () => {
  const store = new MemoryStore();
  await loadCalendar([2026], store, async () => fixture, 1234);
  const cached = await loadCalendar(
    [2026],
    store,
    async () => {
      throw new Error("offline");
    },
    1235,
    true,
  );
  assert.equal(cached.bulletins[2026].fetchedAt, 1234);
  assert.equal(cached.bulletins[2026].state, "stale");
  assert.deepEqual(cached.bulletins[2026].papers, fixture.papers);
  assert.equal(cached.details.get("2026-09-25")?.name, "中秋节");
});

test("selection marks exactly one mode, including fallback for deleted pins", () => {
  const events = [event, { ...event, id: "second", title: "另一个" }];
  for (const pin of [undefined, "test", "missing"]) {
    const choices = selectionOptions(events, pin);
    assert.equal(choices.filter((choice) => choice.selected).length, 1);
    assert.equal(choices.find((choice) => choice.selected)?.id, pin === "test" ? "test" : undefined);
    assert.equal(choices.find((choice) => choice.selected)?.disabled, true);
  }
});
