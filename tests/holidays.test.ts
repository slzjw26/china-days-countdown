import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCalendar, parseHolidayData, calendarWarning } from "../src/lib/holidays";
import { MemoryStore } from "./support";

const bulletin = (year = 2026) => ({
  year,
  papers: ["https://www.gov.cn/holiday-notice"],
  days: [{ date: `${year}-09-20`, name: "调休", isOffDay: false }],
});
const now = Date.parse("2026-09-14T00:00:00Z");

test("downloads valid data, persists it and serves fresh cache offline", async () => {
  const store = new MemoryStore();
  const first = await loadCalendar([2026], store, async () => bulletin(), now);
  assert.equal(first.days.get("2026-09-20"), false);
  assert.deepEqual(first.missingYears, []);
  const cached = await loadCalendar(
    [2026],
    store,
    async () => {
      throw new Error("offline");
    },
    now + 1000,
  );
  assert.equal(cached.days.get("2026-09-20"), false);
  assert.deepEqual(cached.staleYears, []);
});

test("failed refresh preserves last known data and marks it stale", async () => {
  const store = new MemoryStore();
  await loadCalendar([2026], store, async () => bulletin(), now);
  const result = await loadCalendar(
    [2026],
    store,
    async () => {
      throw new Error("offline");
    },
    now + 86_400_001,
  );
  assert.equal(result.days.get("2026-09-20"), false);
  assert.deepEqual(result.staleYears, [2026]);
  assert.deepEqual(result.missingYears, []);
});

test("force refresh bypasses fresh cache and changed data replaces old days", async () => {
  const store = new MemoryStore();
  await loadCalendar([2026], store, async () => bulletin(), now);
  const result = await loadCalendar(
    [2026],
    store,
    async () => ({ ...bulletin(), days: [{ date: "2026-09-25", name: "中秋节", isOffDay: true }] }),
    now + 1,
    true,
  );
  assert.equal(result.days.has("2026-09-20"), false);
  assert.equal(result.days.get("2026-09-25"), true);
});

test("empty announcements and network failure mean estimated, never confirmed", async () => {
  const empty = await loadCalendar([2027], new MemoryStore(), async () => ({ year: 2027, papers: [], days: [] }), now);
  assert.deepEqual(empty.missingYears, [2027]);
  const offline = await loadCalendar(
    [2026],
    new MemoryStore(),
    async () => {
      throw new Error("offline");
    },
    now,
  );
  assert.deepEqual(offline.missingYears, [2026]);
  assert.match(calendarWarning(offline, [2026]) ?? "", /估算/);
  assert.equal(calendarWarning(offline, []), undefined);
});

test("does not replace known bulletin with empty or corrupt upstream data", async () => {
  for (const bad of [
    { year: 2026, papers: [], days: [] },
    { ...bulletin(), days: [{ date: "2026-09-20", name: "bad", isOffDay: "false" }] },
  ]) {
    const store = new MemoryStore();
    await loadCalendar([2026], store, async () => bulletin(), now);
    const result = await loadCalendar([2026], store, async () => bad, now + 1, true);
    assert.equal(result.days.get("2026-09-20"), false);
    assert.deepEqual(result.staleYears, [2026]);
  }
});

test("merges next year's December changes after older bulletin regardless of request order", async () => {
  const result = await loadCalendar(
    [2027, 2026],
    new MemoryStore(),
    async (year) => ({
      year,
      papers: ["notice"],
      days: [{ date: "2026-12-31", name: "元旦", isOffDay: year === 2027 }],
    }),
    now,
  );
  assert.equal(result.days.get("2026-12-31"), true);
});

test("rejects wrong year, invalid date, conflicting duplicates and invalid types", () => {
  for (const data of [
    null,
    { ...bulletin(), year: 2025 },
    { ...bulletin(), papers: "bad" },
    { ...bulletin(), days: [{ date: "2026-02-30", name: "bad", isOffDay: true }] },
    { ...bulletin(), days: [{ date: "2024-12-31", name: "bad", isOffDay: true }] },
    { ...bulletin(), days: [bulletin().days[0], { ...bulletin().days[0], isOffDay: true }] },
  ]) {
    assert.throws(() => parseHolidayData(data, 2026));
  }
});

test("corrupt cache is recoverable without blocking other years", async () => {
  const store = new MemoryStore();
  await store.setItem("holiday:2026", "not json");
  const result = await loadCalendar(
    [2026, 2027],
    store,
    async (year) => (year === 2026 ? bulletin() : { year, papers: [], days: [] }),
    now,
  );
  assert.equal(result.days.get("2026-09-20"), false);
  assert.deepEqual(result.missingYears, [2027]);
});

test("failed manual refresh remains visible on the next cached read", async () => {
  const store = new MemoryStore();
  await loadCalendar([2026], store, async () => bulletin(), now);
  await loadCalendar(
    [2026],
    store,
    async () => {
      throw new Error("offline");
    },
    now + 1,
    true,
  );
  const reopened = await loadCalendar(
    [2026],
    store,
    async () => {
      throw new Error("offline");
    },
    now + 2,
  );
  assert.deepEqual(reopened.staleYears, [2026]);
  const recovered = await loadCalendar([2026], store, async () => bulletin(), now + 3, true);
  assert.deepEqual(recovered.staleYears, []);
});

test("HTTP downloader falls back after bad primary data and validates mirror payload", async (context) => {
  const { fetchHolidayYear } = await import("../src/lib/holidays");
  const requested: string[] = [];
  context.mock.method(globalThis, "fetch", async (url: string) => {
    requested.push(url);
    return new Response(JSON.stringify(requested.length === 1 ? { ...bulletin(), year: 2025 } : bulletin()));
  });
  const data = await fetchHolidayYear(2026);
  assert.equal(data.days[0].isOffDay, false);
  assert.deepEqual(requested, [
    "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/2026.json",
    "https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/2026.json",
  ]);
});

test("HTTP downloader rejects both unavailable sources", async (context) => {
  const { fetchHolidayYear } = await import("../src/lib/holidays");
  context.mock.method(globalThis, "fetch", async () => new Response("missing", { status: 404 }));
  await assert.rejects(fetchHolidayYear(2027), /2027/);
});
