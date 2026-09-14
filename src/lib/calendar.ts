import { formatDay, interval, parseDay } from "./dates";
import type { Calendar } from "./holidays";
import type { CountdownEvent } from "./model";

export const weekNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** Adjacent dates complete Monday–Sunday weeks; only unsupported boundary years stay blank. */
export function monthCells(month: string): (string | null)[] {
  const first = parseDay(`${month}-01`);
  const date = new Date(first * 86_400_000);
  const offset = (date.getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((offset + length) / 7) * 7 }, (_, index) => {
    const day = first + index - offset;
    return day < parseDay("1900-01-01") || day > parseDay("2199-12-31") ? null : formatDay(day);
  });
}

export function shiftMonth(month: string, delta: number): string {
  parseDay(`${month}-01`);
  const [year, number] = month.split("-").map(Number);
  const result = new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7);
  return result < "1900-01" ? "1900-01" : result > "2199-12" ? "2199-12" : result;
}

export function calendarYears(month: string): number[] {
  parseDay(`${month}-01`);
  const year = Number(month.slice(0, 4));
  return month.endsWith("-12") ? [year, year + 1] : [year];
}

/** Include holiday sources for selectable adjacent dates, including cross-year padding. */
export function visibleCalendarYears(month: string): number[] {
  return [...new Set(monthCells(month).flatMap((date) => (date ? calendarYears(date.slice(0, 7)) : [])))].sort(
    (a, b) => a - b,
  );
}

export interface DayDescription {
  kind: "holiday" | "makeup" | "weekend" | "weekday";
  uncertain: boolean;
  inRange: boolean;
  counted: boolean;
  label: string;
  participation?: string;
  estimatedCount: boolean;
  description: string;
}

/** Explain the same override-first rule used by the counter, including excluded endpoints. */
export function describeDay(date: string, calendar: Calendar, today: string, event?: CountdownEvent): DayDescription {
  const ordinal = parseDay(date);
  const week = new Date(ordinal * 86_400_000).getUTCDay();
  const off = calendar.days.get(date);
  const detail = calendar.details.get(date);
  const weekend = week === 0 || week === 6;
  const kind = off === true ? "holiday" : off === false ? "makeup" : weekend ? "weekend" : "weekday";
  const uncertain = calendarYears(date.slice(0, 7)).some(
    (year) => !calendar.bulletins[year] || calendar.bulletins[year].state === "missing",
  );
  const working = off === false || (off === undefined && !weekend);
  const [first, last] = event ? interval(today, event.targetDate, event) : [1, 0];
  const inRange = Boolean(event && ordinal >= first && ordinal <= last);
  const counted = inRange && (event?.mode === "calendar" || working);
  const estimatedCount = uncertain && event?.mode === "workday";
  const participation = !event
    ? undefined
    : inRange
      ? counted
        ? "✓ 计入"
        : "− 不计"
      : date === today && !event.includeToday
        ? "今天不计"
        : date === event.targetDate && !event.includeTarget
          ? "目标日不计"
          : "区间外";
  const label = kind === "holiday" ? "休" : kind === "makeup" ? "班" : kind === "weekend" ? "周末" : "工作日";
  const reason = detail ? `${detail.name} · ${off ? "放假" : "调休补班"}` : weekend ? "普通周末" : "周一至周五规则";
  const rangeReason = !event ? "" : !inRange ? " · 不在计数区间" : counted ? " · 计入" : " · 休息日，不计入";
  return {
    kind,
    uncertain,
    inRange,
    counted,
    participation,
    estimatedCount,
    label,
    description: `${date} · ${weekNames[week]} · ${reason}${uncertain ? " · 假期信息未确认（按已知数据估算）" : ""}${rangeReason}`,
  };
}

/** Rest/work colors and participation backgrounds represent independent meanings. */
export function dayAppearance(date: string, day: DayDescription, month: string) {
  return {
    color: day.uncertain
      ? "#976400"
      : day.kind === "holiday" || day.kind === "weekend"
        ? "#ba3042"
        : day.kind === "makeup"
          ? "#167849"
          : "#334155",
    background: day.inRange ? (day.estimatedCount ? "#fff1d6" : day.counted ? "#d8efe3" : "#fbe4e7") : "#f1f5f9",
    status: day.participation
      ? day.estimatedCount && day.inRange
        ? `≈ ${day.counted ? "计入" : "不计"}`
        : day.participation
      : day.uncertain
        ? "假期未确认"
        : "",
    adjacent: !date.startsWith(month),
  };
}

/** Compact SVG contains only fixed labels and numeric dates, never external titles. */
export function dayImage(
  date: string,
  day: DayDescription,
  today: string,
  target?: string,
  month = date.slice(0, 7),
): string {
  const { color, background, status, adjacent } = dayAppearance(date, day, month);
  const marker = [date === today ? "今天" : "", date === target ? "目标" : ""].filter(Boolean).join("·");
  const week = weekNames[new Date(`${date}T00:00:00Z`).getUTCDay()];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90"><rect x="3" y="3" width="154" height="84" rx="9" fill="${background}" stroke="${date === target ? "#2563eb" : date === today ? "#16a085" : "#dbe2ea"}" stroke-width="${date === target || date === today ? 3 : 1}"/><g opacity="${adjacent ? 0.55 : 1}" font-family="sans-serif"><text x="14" y="21" fill="#475569" font-size="11">${adjacent ? `${Number(date.slice(5, 7))}月 ` : ""}${marker}</text><text x="144" y="21" text-anchor="end" fill="#475569" font-size="11">${week}</text><text x="14" y="53" fill="${color}" font-size="29" font-weight="600">${Number(date.slice(8))}</text><text x="144" y="50" text-anchor="end" fill="${color}" font-size="14">${day.uncertain ? "? " : ""}${day.label}</text><text x="80" y="75" text-anchor="middle" fill="#334155" font-size="13" font-weight="600">${status}</text></g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
