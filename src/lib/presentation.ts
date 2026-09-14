import { formatDay, interval } from "./dates";
import type { CountdownEvent } from "./model";
import type { CountdownRow } from "./snapshot";

/** Normal results need no extra status; only incomplete data and failures are surfaced. */
export function calculationStatus(row: CountdownRow):
  | {
      tone: "warning" | "error";
      message: string;
    }
  | undefined {
  if (row.error) return { tone: "error", message: row.error };
  if (row.expired || !row.naturalDays || row.event.mode === "calendar") return undefined;
  if (row.estimated) return { tone: "warning", message: "假期信息不完整，当前为估算。" };
  if (row.warning) return { tone: "warning", message: "假期更新失败，当前使用缓存中的安排。" };
  return undefined;
}

/** Both endpoints always retain the year, even when the range stays within one year. */
export function dateRangeLabel(today: string, event: CountdownEvent): string {
  const [first, last] = interval(today, event.targetDate, event);
  return first <= last ? `${formatDay(first)} → ${formatDay(last)}` : "无计入日期";
}

/** Notes are plain text: escape Markdown/HTML so images and formatting are never interpreted. */
export function notesMarkdown(notes?: string): string {
  if (!notes?.trim()) return "*暂无备注*";
  return notes
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/[\\`*_{}[\]()#+.!|~-]/g, "\\$&"),
    )
    .join("  \n");
}
