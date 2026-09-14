import { parseDay } from "./dates";
import type { Store } from "./repository";

export interface HolidayData {
  year: number;
  papers: string[];
  days: { date: string; name: string; isOffDay: boolean }[];
}
export interface Calendar {
  days: Map<string, boolean>;
  details: Map<string, { name: string; isOffDay: boolean; bulletinYear: number }>;
  bulletins: Record<number, { papers: string[]; fetchedAt?: number; state: "ready" | "missing" | "stale" }>;
  missingYears: number[];
  staleYears: number[];
}
interface CachedYear {
  data: HolidayData;
  fetchedAt: number;
  refreshFailed?: boolean;
}
export const emptyCalendar = (): Calendar => ({
  days: new Map(),
  details: new Map(),
  bulletins: {},
  missingYears: [],
  staleYears: [],
});

export function parseHolidayData(value: unknown, expectedYear: number): HolidayData {
  if (!value || typeof value !== "object") throw new Error("假期数据格式错误");
  const v = value as Record<string, unknown>;
  if (
    v.year !== expectedYear ||
    !Array.isArray(v.papers) ||
    !v.papers.every((p) => typeof p === "string") ||
    !Array.isArray(v.days) ||
    v.days.length > 400
  ) {
    throw new Error("假期数据年份或结构无效");
  }
  const seen = new Map<string, boolean>();
  const days = v.days.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("假期记录无效");
    const day = item as Record<string, unknown>;
    if (typeof day.date !== "string" || typeof day.name !== "string" || typeof day.isOffDay !== "boolean")
      throw new Error("假期记录字段无效");
    parseDay(day.date);
    const year = Number(day.date.slice(0, 4));
    if (year !== expectedYear && !(year === expectedYear - 1 && day.date.slice(5, 7) === "12"))
      throw new Error("假期记录超出公告年份");
    if (seen.has(day.date) && seen.get(day.date) !== day.isOffDay) throw new Error("假期记录冲突");
    seen.set(day.date, day.isOffDay);
    return { date: day.date, name: day.name, isOffDay: day.isOffDay };
  });
  return { year: expectedYear, papers: v.papers as string[], days };
}

const published = (data: HolidayData) => data.papers.length > 0 && data.days.length > 0;

/** Only public annual JSON is requested; no event names or dates are transmitted. */
export async function fetchHolidayYear(year: number): Promise<HolidayData> {
  const urls = [
    `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`,
    `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`,
  ];
  let lastError: unknown;
  for (const url of urls) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error(`假期下载 HTTP ${response.status}`);
      const body = await response.text();
      if (body.length > 1_000_000) throw new Error("假期响应过大");
      return parseHolidayData(JSON.parse(body), year);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`${year} 年假期下载失败`, { cause: lastError });
}

export async function loadCalendar(
  years: number[],
  store: Store,
  fetcher: (year: number) => Promise<unknown> = fetchHolidayYear,
  now = Date.now(),
  force = false,
): Promise<Calendar> {
  const result = emptyCalendar();
  const sortedYears = [...new Set(years)].sort((a, b) => a - b);
  // Batch downloads so long ranges cannot start unbounded network requests.
  for (let offset = 0; offset < sortedYears.length; offset += 4) {
    const rows = await Promise.all(
      sortedYears.slice(offset, offset + 4).map(async (year) => {
        let cached: CachedYear | undefined;
        try {
          const raw = await store.getItem(`holiday:${year}`);
          if (raw) {
            const value = JSON.parse(raw);
            if (typeof value.fetchedAt === "number" && Number.isFinite(value.fetchedAt)) {
              cached = {
                data: parseHolidayData(value.data, year),
                fetchedAt: value.fetchedAt,
                refreshFailed: value.refreshFailed === true,
              };
            }
          }
        } catch {
          /* Corrupt cache is replaceable; event storage is separate. */
        }
        const fresh = cached && now >= cached.fetchedAt && now - cached.fetchedAt < 86_400_000;
        if (cached && fresh && !force)
          return { year, data: cached.data, fetchedAt: cached.fetchedAt, stale: cached.refreshFailed === true };
        try {
          const data = parseHolidayData(await fetcher(year), year);
          if (!published(data) && cached && published(cached.data)) throw new Error("上游公告暂不可用");
          await store.setItem(`holiday:${year}`, JSON.stringify({ data, fetchedAt: now }));
          return { year, data, fetchedAt: now, stale: false };
        } catch {
          if (cached) {
            try {
              await store.setItem(`holiday:${year}`, JSON.stringify({ ...cached, refreshFailed: true }));
            } catch {
              /* A cache write failure must not discard the last usable bulletin. */
            }
          }
          return {
            year,
            data: cached?.data,
            fetchedAt: cached?.fetchedAt,
            stale: Boolean(cached && published(cached.data)),
          };
        }
      }),
    );
    for (const row of rows) {
      if (!row.data || !published(row.data)) result.missingYears.push(row.year);
      if (row.stale) result.staleYears.push(row.year);
      result.bulletins[row.year] = {
        papers: row.data?.papers ?? [],
        fetchedAt: row.fetchedAt,
        state: !row.data || !published(row.data) ? "missing" : row.stale ? "stale" : "ready",
      };
      for (const day of row.data?.days ?? []) {
        result.days.set(day.date, day.isOffDay);
        result.details.set(day.date, { name: day.name, isOffDay: day.isOffDay, bulletinYear: row.year });
      }
    }
  }
  return result;
}

export function calendarWarning(calendar: Calendar, years: number[]): string | undefined {
  const missing = years.filter((year) => calendar.missingYears.includes(year));
  const stale = years.filter((year) => calendar.staleYears.includes(year));
  const warnings: string[] = [];
  if (missing.length) warnings.push(`估算：${missing.join("、")} 年公告未发布或无法获取，未知日期按周一至周五计算`);
  if (stale.length) warnings.push(`${stale.join("、")} 年更新失败，使用缓存`);
  return warnings.length ? warnings.join("；") : undefined;
}
