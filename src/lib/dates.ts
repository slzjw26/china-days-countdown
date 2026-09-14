/** Calendar dates are UTC day ordinals, never local-midnight millisecond durations. */
const DAY_MS = 86_400_000;
export interface CountOptions {
  mode: "calendar" | "workday";
  includeToday: boolean;
  includeTarget: boolean;
}

export function parseDay(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("日期须为 YYYY-MM-DD");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 2199 || date.toISOString().slice(0, 10) !== value) {
    throw new Error("请输入 1900–2199 年之间的有效日期");
  }
  return date.getTime() / DAY_MS;
}

export function formatDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function todayInZone(zone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone === "system" ? undefined : zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function interval(today: string, target: string, options: CountOptions): [number, number] {
  const first = parseDay(today);
  const last = parseDay(target);
  const latest = `${Number(today.slice(0, 4)) + 20}${today.slice(4)}`;
  if (target > latest) throw new Error("单个倒计时最多支持 20 年，请缩短目标日期");
  if (last < first) return [1, 0];
  return [first + (options.includeToday ? 0 : 1), last - (options.includeTarget ? 0 : 1)];
}

export function countDays(
  today: string,
  target: string,
  options: CountOptions,
  days: ReadonlyMap<string, boolean> = new Map(),
): number {
  const [start, end] = interval(today, target, options);
  if (options.mode === "calendar") return Math.max(0, end - start + 1);
  let count = 0;
  for (let day = start; day <= end; day++) {
    const off = days.get(formatDay(day));
    const weekDay = new Date(day * DAY_MS).getUTCDay();
    if (off === false || (off === undefined && weekDay >= 1 && weekDay <= 5)) count++;
  }
  return count;
}

/** December can be overridden by the next year's bulletin. */
export function requiredYears(today: string, target: string, options: CountOptions): number[] {
  const [start, end] = interval(today, target, options);
  const years = new Set<number>();
  for (let day = start; day <= end; day++) {
    const date = new Date(day * DAY_MS);
    years.add(date.getUTCFullYear());
    if (date.getUTCMonth() === 11) years.add(date.getUTCFullYear() + 1);
  }
  return [...years].sort((a, b) => a - b);
}
