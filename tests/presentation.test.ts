import { test } from "node:test";
import assert from "node:assert/strict";
import { calculationStatus, dateRangeLabel, notesMarkdown } from "../src/lib/presentation";
import type { CountdownRow } from "../src/lib/snapshot";
const row: CountdownRow = {
  event: {
    id: "test",
    title: "测试",
    targetDate: "2026-10-22",
    mode: "workday",
    includeToday: false,
    includeTarget: true,
  },
  remaining: 24,
  naturalDays: 38,
  expired: false,
  estimated: false,
};
test("detail only exposes status for incomplete data, stale cache or calculation errors", () => {
  assert.equal(calculationStatus(row), undefined);
  assert.equal(calculationStatus({ ...row, estimated: true })?.tone, "warning");
  assert.match(calculationStatus({ ...row, estimated: true })!.message, /估算/);
  assert.match(calculationStatus({ ...row, warning: "2026 年更新失败，使用缓存" })!.message, /缓存/);
  assert.equal(calculationStatus({ ...row, error: "日期超限" })?.tone, "error");
  assert.equal(calculationStatus({ ...row, expired: true }), undefined);
  assert.equal(calculationStatus({ ...row, naturalDays: 0 }), undefined);
  assert.equal(calculationStatus({ ...row, event: { ...row.event, mode: "calendar" } }), undefined);
});
test("range always includes both years and uses effective endpoints", () => {
  assert.equal(dateRangeLabel("2026-09-14", row.event), "2026-09-15 → 2026-10-22");
  assert.equal(dateRangeLabel("2026-09-14", { ...row.event, targetDate: "2026-09-24" }), "2026-09-15 → 2026-09-24");
  assert.equal(
    dateRangeLabel("2026-12-30", { ...row.event, targetDate: "2027-01-05", includeTarget: false }),
    "2026-12-31 → 2027-01-04",
  );
  assert.equal(dateRangeLabel("2026-09-14", { ...row.event, targetDate: "2026-09-14" }), "无计入日期");
});
test("notes are rendered as literal multiline text, with a quiet empty state", () => {
  assert.equal(notesMarkdown(undefined), "*暂无备注*");
  assert.equal(notesMarkdown("  \n "), "*暂无备注*");
  assert.equal(notesMarkdown("第一行\n第二行"), "第一行  \n第二行");
  const result = notesMarkdown("# 标题\n![图片](https://example.com/a.png)\n<script>&文本</script>");
  assert.ok(result.startsWith("\\# 标题"));
  assert.ok(result.includes("\\!\\[图片\\]\\("));
  assert.ok(result.includes("&lt;script&gt;&amp;文本&lt;/script&gt;"));
});
