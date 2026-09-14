import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSnapshot, menuTitle } from "../src/lib/snapshot";
import { EventRepository } from "../src/lib/repository";
import { MemoryStore } from "./support";

const now = new Date("2026-09-14T00:00:00Z");
const event = {
  id: "trip",
  title: "旅行",
  targetDate: "2026-09-25",
  mode: "workday" as const,
  includeToday: false,
  includeTarget: true,
};

test("snapshot combines persisted events and holiday rules into list and menu values", async () => {
  const store = new MemoryStore();
  await new EventRepository(store).save(event);
  const snapshot = await loadSnapshot(store, "Asia/Shanghai", false, now, async () => ({
    year: 2026,
    papers: ["notice"],
    days: [
      { date: "2026-09-20", name: "补班", isOffDay: false },
      { date: "2026-09-25", name: "中秋节", isOffDay: true },
    ],
  }));
  assert.equal(snapshot.rows[0].remaining, 9);
  assert.equal(snapshot.rows[0].naturalDays, 11);
  assert.equal(snapshot.rows[0].estimated, false);
  assert.equal(menuTitle(snapshot.rows[0]), "旅行 · 9 工作日");
});

test("offline workday result is visibly estimated in both row and menu", async () => {
  const store = new MemoryStore();
  await new EventRepository(store).save(event);
  const snapshot = await loadSnapshot(store, "Asia/Shanghai", false, now, async () => {
    throw new Error("offline");
  });
  assert.equal(snapshot.rows[0].estimated, true);
  assert.match(snapshot.rows[0].warning ?? "", /估算/);
  assert.match(menuTitle(snapshot.rows[0]), /≈/);
});

test("calendar and expired events need no holiday download", async () => {
  const store = new MemoryStore();
  const repo = new EventRepository(store);
  await repo.save({ ...event, id: "past", targetDate: "2026-09-01" });
  await repo.save({ ...event, id: "natural", mode: "calendar" });
  let requests = 0;
  const snapshot = await loadSnapshot(store, "Asia/Shanghai", false, now, async () => {
    requests++;
    throw new Error("unexpected network");
  });
  assert.equal(requests, 0);
  assert.equal(snapshot.rows[0].expired, true);
  assert.equal(snapshot.rows[0].remaining, 0);
  assert.match(menuTitle(snapshot.rows[0]), /已过期/);
  assert.equal(snapshot.rows[1].remaining, 11);
});

test("one unsupported range cannot break other events", async () => {
  const store = new MemoryStore();
  const repo = new EventRepository(store);
  await repo.save({ ...event, mode: "calendar" });
  await repo.save({ ...event, id: "far", targetDate: "2099-01-01" });
  const snapshot = await loadSnapshot(store, "Asia/Shanghai", false, now);
  assert.equal(snapshot.rows[0].remaining, 11);
  assert.ok(snapshot.rows[1].error);
  assert.match(menuTitle(snapshot.rows[1]), /日期超限/);
});
