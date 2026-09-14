import { countDays, interval, requiredYears, todayInZone } from "./dates";
import { calendarWarning, fetchHolidayYear, loadCalendar, type Calendar } from "./holidays";
import { EventRepository, type Store } from "./repository";
import type { CountdownEvent } from "./model";

export interface CountdownRow {
  event: CountdownEvent;
  remaining: number;
  naturalDays: number;
  expired: boolean;
  estimated: boolean;
  warning?: string;
  error?: string;
}
export interface Snapshot {
  calendar: Calendar;
  today: string;
  rows: CountdownRow[];
  pinnedId?: string;
  invalidCount: number;
  menuEnabled: boolean;
}

/** A shared snapshot keeps list and menu calculations and uncertainty labels identical. */
export async function loadSnapshot(
  store: Store,
  zone: string,
  force = false,
  now = new Date(),
  fetcher = fetchHolidayYear,
): Promise<Snapshot> {
  const today = todayInZone(zone, now);
  const repository = new EventRepository(store);
  const [{ events, invalidCount }, pinnedId, enabled] = await Promise.all([
    repository.list(),
    repository.getPinned(),
    store.getItem("settings:menu-enabled"),
  ]);
  const requests = events.map((event) => {
    try {
      interval(today, event.targetDate, event);
      return {
        event,
        years: event.mode === "workday" ? requiredYears(today, event.targetDate, event) : [],
        error: undefined,
      };
    } catch (error) {
      return { event, years: [], error: error instanceof Error ? error.message : "日期计算失败" };
    }
  });
  const calendar = await loadCalendar(
    requests.flatMap((item) => item.years),
    store,
    fetcher,
    now.getTime(),
    force,
  );
  const rows = requests.map(({ event, years, error }): CountdownRow => ({
    event,
    error,
    expired: event.targetDate < today,
    remaining: error ? 0 : countDays(today, event.targetDate, event, calendar.days),
    naturalDays: error ? 0 : countDays(today, event.targetDate, { ...event, mode: "calendar" }),
    estimated: years.some((year) => calendar.missingYears.includes(year)),
    warning: calendarWarning(calendar, years),
  }));
  return { calendar, today, rows, pinnedId, invalidCount, menuEnabled: enabled === "true" };
}

export function menuTitle(row?: CountdownRow): string {
  if (!row) return "暂无倒计时";
  const title = [...row.event.title].slice(0, 16).join("");
  if (row.error) return `${title} · 日期超限`;
  if (row.expired) return `${title} · 已过期`;
  return `${title} · ${row.estimated ? "≈" : ""}${row.remaining} ${row.event.mode === "workday" ? "工作日" : "天"}${row.warning && !row.estimated ? " ⚠" : ""}`;
}
