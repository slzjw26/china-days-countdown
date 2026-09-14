import { Action, ActionPanel, Grid, Icon, Keyboard, useNavigation } from "@raycast/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { visibleCalendarYears, dayImage, describeDay, monthCells, shiftMonth } from "../lib/calendar";
import { countDays, requiredYears } from "../lib/dates";
import { emptyCalendar, loadCalendar, type Calendar } from "../lib/holidays";
import type { CountdownEvent } from "../lib/model";
import { store } from "../lib/runtime";

export interface HolidayCalendarProps {
  today: string;
  initialDate: string;
  initialCalendar?: Calendar;
  event?: CountdownEvent;
  onSelect?: (date: string) => void;
  onRefresh?: () => Promise<void>;
}

/** One month grid serves selection and read-only inspection; editing never mutates storage here. */
export function HolidayCalendar({
  today,
  initialDate,
  initialCalendar,
  event,
  onSelect,
  onRefresh,
}: HolidayCalendarProps) {
  const { pop } = useNavigation();
  const [month, setMonth] = useState(initialDate.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(initialDate);
  const [calendar, setCalendar] = useState<Calendar>(initialCalendar ?? emptyCalendar());
  const calendarRef = useRef(calendar);
  const sequence = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const refresh = useCallback(
    async (force = false) => {
      const ticket = ++sequence.current;
      setLoading(true);
      setError(undefined);
      const pending = queue.current.then(async () => {
        try {
          const previous = calendarRef.current;
          const needed = [
            ...new Set([
              ...Object.keys(previous.bulletins).map(Number),
              ...visibleCalendarYears(month),
              ...(event?.mode === "workday" ? requiredYears(today, event.targetDate, event) : []),
            ]),
          ];
          const missing = needed.filter((year) => !previous.bulletins[year]);
          // Existing event years keep the exact snapshot used by the count until explicit refresh.
          const fetched = await loadCalendar(force ? needed : missing, store, undefined, Date.now(), force);
          const next = force
            ? fetched
            : {
                days: new Map(previous.days),
                details: new Map(previous.details),
                bulletins: { ...previous.bulletins, ...fetched.bulletins },
                missingYears: [...previous.missingYears, ...fetched.missingYears],
                staleYears: [...previous.staleYears, ...fetched.staleYears],
              };
          if (!force)
            for (const [date, detail] of fetched.details) {
              if ((next.details.get(date)?.bulletinYear ?? 0) <= detail.bulletinYear) {
                next.details.set(date, detail);
                next.days.set(date, detail.isOffDay);
              }
            }
          // Serialize data changes across month navigation so a forced refresh is never discarded.
          calendarRef.current = next;
          setCalendar(next);
          if (force) await onRefresh?.();
        } catch (error) {
          if (ticket === sequence.current) setError(error instanceof Error ? error.message : "日历读取失败");
        } finally {
          if (ticket === sequence.current) setLoading(false);
        }
      });
      queue.current = pending;
      await pending;
    },
    [month, event, today, onRefresh],
  );
  useEffect(() => {
    void refresh();
    return () => {
      sequence.current++;
    };
  }, [refresh]);

  function changeMonth(value: string) {
    setMonth(value);
    setSelected(`${value}-01`);
  }
  const selectedDate = selected && monthCells(month).includes(selected) ? selected : undefined;
  const info = selectedDate ? describeDay(selectedDate, calendar, today, event) : undefined;
  const estimated =
    event?.mode === "workday" &&
    requiredYears(today, event.targetDate, event).some((year) => calendar.missingYears.includes(year));
  const remaining = event ? countDays(today, event.targetDate, event, calendar.days) : undefined;
  const summary = loading
    ? "正在读取假期…"
    : event
      ? `${estimated ? "≈ " : ""}${remaining} ${event.mode === "workday" ? "工作日" : "自然日"}`
      : "选日后回填 · 休息日也可选";
  const latest = `${Math.min(2199, Number(today.slice(0, 4)) + 20)}${today.slice(4)}`;
  const sourceYears = visibleCalendarYears(month);

  function actions(date?: string) {
    const explanation = date ? describeDay(date, calendar, today, event).description : "";
    return (
      <ActionPanel>
        {date && onSelect && date <= latest && (
          <Action
            title="选择此日期"
            icon={Icon.Checkmark}
            onAction={() => {
              onSelect(date);
              pop();
            }}
          />
        )}
        {date && <Action.CopyToClipboard title="复制日期说明" content={explanation} />}
        <ActionPanel.Section title="切换日期">
          <Action
            title="上个月"
            icon={Icon.ArrowLeft}
            shortcut={{ modifiers: ["cmd"], key: "arrowLeft" }}
            onAction={() => changeMonth(shiftMonth(month, -1))}
          />
          <Action
            title="下个月"
            icon={Icon.ArrowRight}
            shortcut={{ modifiers: ["cmd"], key: "arrowRight" }}
            onAction={() => changeMonth(shiftMonth(month, 1))}
          />
          <Action
            title="回到今天"
            icon={Icon.Calendar}
            shortcut={{ modifiers: ["cmd"], key: "t" }}
            onAction={() => {
              setMonth(today.slice(0, 7));
              setSelected(today);
            }}
          />
          <ActionPanel.Submenu title="选择月份" icon={Icon.Calendar}>
            {Array.from({ length: 12 }, (_, i) => {
              const value = `${month.slice(0, 4)}-${String(i + 1).padStart(2, "0")}`;
              return <Action key={value} title={`${i + 1} 月`} onAction={() => changeMonth(value)} />;
            })}
          </ActionPanel.Submenu>
        </ActionPanel.Section>
        <ActionPanel.Section title="日历数据">
          <Action
            title="刷新假期数据"
            icon={Icon.ArrowClockwise}
            shortcut={Keyboard.Shortcut.Common.Refresh}
            onAction={() => refresh(true)}
          />
          <Action.OpenInBrowser title="数据来源：Holiday CN" url="https://github.com/NateScarlet/holiday-cn" />
        </ActionPanel.Section>
        {sourceYears.map((year) => {
          const bulletin = calendar.bulletins[year];
          const state =
            bulletin?.state === "ready" ? "已加载" : bulletin?.state === "stale" ? "更新失败，使用缓存" : "假期未确认";
          const updated = bulletin?.fetchedAt ? new Date(bulletin.fetchedAt).toLocaleString("zh-CN") : "尚无缓存";
          return (
            <ActionPanel.Section key={year} title={`${year} · ${state} · ${updated}`}>
              <Action.CopyToClipboard
                title={`复制 ${year} 年数据状态`}
                content={`${year} 年：${state}\n缓存更新时间：${updated}\n${bulletin?.papers.join("\n") ?? ""}`}
              />
              {bulletin?.papers
                .filter((url) => /^https:\/\//.test(url))
                .map((url, index) => (
                  <Action.OpenInBrowser key={url} title={`查看 ${year} 年国务院公告 ${index + 1}`} url={url} />
                ))}
            </ActionPanel.Section>
          );
        })}
      </ActionPanel>
    );
  }

  return (
    <Grid
      columns={7}
      aspectRatio="16/9"
      filtering={false}
      isLoading={loading}
      selectedItemId={selected ?? undefined}
      onSelectionChange={setSelected}
      navigationTitle={`${onSelect ? "选择目标日期" : "假期日历"} · ${summary}`}
      searchBarPlaceholder="⌘← / ⌘→ 切月 · ⌘T 今天 · ⌘K 更多"
      searchBarAccessory={
        <Grid.Dropdown
          tooltip="选择年份"
          value={month.slice(0, 4)}
          onChange={(year) => changeMonth(`${year}${month.slice(4)}`)}
        >
          {Array.from({ length: 300 }, (_, i) => String(1900 + i)).map((year) => (
            <Grid.Dropdown.Item key={year} value={year} title={`${year} 年`} />
          ))}
        </Grid.Dropdown>
      }
      actions={actions()}
    >
      <Grid.Section
        title={`${month} · ${summary}`}
        subtitle={error ?? (loading ? "假期状态加载中" : (info?.description ?? "请选择日期"))}
      >
        {monthCells(month).map((date, index) =>
          date ? (
            <Grid.Item
              key={date}
              id={date}
              content={
                loading
                  ? Icon.Clock
                  : {
                      tooltip: describeDay(date, calendar, today, event).description,
                      value: {
                        source: dayImage(
                          date,
                          describeDay(date, calendar, today, event),
                          today,
                          event?.targetDate ?? initialDate,
                          month,
                        ),
                      },
                    }
              }
              actions={actions(date)}
            />
          ) : (
            <Grid.Item key={`blank-${index}`} id={`blank-${index}`} content={Icon.Minus} actions={actions()} />
          ),
        )}
      </Grid.Section>
    </Grid>
  );
}
