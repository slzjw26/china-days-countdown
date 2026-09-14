import { parseDay, type CountOptions } from "./dates";

export interface CountdownEvent extends CountOptions {
  id: string;
  title: string;
  targetDate: string;
  notes?: string;
}

/** Preserve multiline plain text; an absent or blank note remains compatible with older records. */
export function validateNotes(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error("备注须为文本");
  if ([...value].length > 1000) throw new Error("备注最多 1000 字");
  return value.trim() ? value.replace(/\r\n?/g, "\n") : undefined;
}

/** Validate both form values and persisted records at their boundary. */
export function validateEvent(value: unknown): CountdownEvent {
  if (!value || typeof value !== "object") throw new Error("事件数据格式错误");
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(v.id)) throw new Error("事件 ID 无效");
  if (typeof v.title !== "string" || !v.title.trim() || v.title.trim().length > 80)
    throw new Error("名称须为 1–80 个字符");
  if (typeof v.targetDate !== "string") throw new Error("目标日期无效");
  parseDay(v.targetDate);
  if (v.mode !== "calendar" && v.mode !== "workday") throw new Error("计算模式无效");
  if (typeof v.includeToday !== "boolean" || typeof v.includeTarget !== "boolean") throw new Error("日期包含选项无效");
  const notes = validateNotes(v.notes);
  return {
    id: v.id,
    title: v.title.trim(),
    targetDate: v.targetDate,
    mode: v.mode,
    includeToday: v.includeToday,
    includeTarget: v.includeTarget,
    ...(notes === undefined ? {} : { notes }),
  };
}

export function sortEvents(events: CountdownEvent[]): CountdownEvent[] {
  return [...events].sort(
    (a, b) => a.targetDate.localeCompare(b.targetDate) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
  );
}

export function selectEvent(
  events: CountdownEvent[],
  pinnedId: string | undefined,
  today: string,
): CountdownEvent | undefined {
  return events.find((event) => event.id === pinnedId) ?? sortEvents(events).find((event) => event.targetDate >= today);
}
