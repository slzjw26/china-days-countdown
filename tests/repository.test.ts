import { test } from "node:test";
import assert from "node:assert/strict";
import { EventRepository } from "../src/lib/repository";
import { MemoryStore } from "./support";
import { validateEvent } from "../src/lib/model";

const event = {
  id: "event-a",
  title: "出发",
  targetDate: "2026-09-25",
  mode: "workday" as const,
  includeToday: false,
  includeTarget: true,
};

test("creates, reads after restart, edits and removes events", async () => {
  const store = new MemoryStore();
  const repo = new EventRepository(store);
  await repo.save(event);
  const restarted = new EventRepository(store);
  assert.deepEqual((await restarted.list()).events, [event]);
  await restarted.save({ ...event, title: "新名称" });
  assert.equal((await repo.list()).events[0].title, "新名称");
  await repo.remove(event.id);
  assert.deepEqual((await restarted.list()).events, []);
});

test("optional notes survive save/reload/edit/clear without migrating legacy events", async () => {
  const store = new MemoryStore();
  await store.setItem(`event:${event.id}`, JSON.stringify(event));
  const repo = new EventRepository(store);
  assert.deepEqual((await repo.list()).events, [event]);
  const notes = "第一行\n准备资料 <原文> [不是链接](https://example.com)";
  await repo.save({ ...event, notes });
  const reopened = (await new EventRepository(store).list()).events[0];
  assert.equal(reopened.notes, notes);
  await repo.save({ ...reopened, title: "更新标题" });
  assert.equal((await repo.list()).events[0].notes, notes);
  await repo.save({ ...reopened, notes: "" });
  assert.equal((await repo.list()).events[0].notes, undefined);
  assert.equal(validateEvent({ ...event, notes: "😀".repeat(1000) }).notes?.length, 2000);
  assert.throws(() => validateEvent({ ...event, notes: "字".repeat(1001) }), /1000/);
  assert.throws(() => validateEvent({ ...event, notes: 123 }), /备注/);
});

test("independent writes do not lose events and pinned settings persist", async () => {
  const store = new MemoryStore();
  const a = new EventRepository(store);
  const b = new EventRepository(store);
  await Promise.all([a.save(event), b.save({ ...event, id: "event-b" })]);
  assert.equal((await a.list()).events.length, 2);
  await a.setPinned(event.id);
  assert.equal(await b.getPinned(), event.id);
  await b.setPinned(undefined);
  assert.equal(await a.getPinned(), undefined);
});

test("corrupt records are reported and preserved while valid events remain usable", async () => {
  const store = new MemoryStore();
  await store.setItem("event:broken", "{");
  const repo = new EventRepository(store);
  await repo.save(event);
  const result = await repo.list();
  assert.equal(result.events.length, 1);
  assert.equal(result.invalidCount, 1);
  assert.equal(await store.getItem("event:broken"), "{");
  await assert.rejects(repo.save({ ...event, targetDate: "2026-02-30" }));
});
