import { Action, ActionPanel, Color, Detail, Icon, Keyboard } from "@raycast/api";
import { useCallback } from "react";
import { useCountdowns } from "../hooks/use-countdowns";
import { calculationStatus, dateRangeLabel, notesMarkdown } from "../lib/presentation";
import { EventForm } from "./event-form";
import { HolidayCalendar } from "./holiday-calendar";

/** Detail owns live event data so an edit returns to an up-to-date page. */
export function EventDetail({ eventId, onChanged }: { eventId: string; onChanged: () => Promise<void> }) {
  const { snapshot, isLoading, error, reload } = useCountdowns();
  const row = snapshot?.rows.find((row) => row.event.id === eventId);
  const updated = useCallback(async () => {
    await reload();
    await onChanged();
  }, [reload, onChanged]);
  if (!row || !snapshot)
    return (
      <Detail
        isLoading={isLoading}
        markdown={error ?? (isLoading ? "正在读取事项…" : "事项不存在或已删除，请返回列表。")}
      />
    );

  const { event } = row;
  const range = row.error ? "无法计算" : dateRangeLabel(snapshot.today, event);
  const title = event.title.replace(/[\\`*_{}[\]()#+.!>|-]/g, "\\$&");
  const status = calculationStatus(row);
  const result =
    row.error ??
    (row.expired
      ? "已过期"
      : `剩余 ${row.estimated ? "≈ " : ""}${row.remaining} 个${event.mode === "workday" ? "工作日" : "自然日"}`);
  return (
    <Detail
      isLoading={isLoading}
      navigationTitle={event.title}
      markdown={`## ${title}\n\n# ${result}\n\n${event.mode === "workday" && !row.expired && !row.error ? `所选区间共 ${row.naturalDays} 个自然日\n\n` : ""}${status?.tone === "warning" ? `> ⚠ ${status.message}\n\n` : ""}---\n\n${notesMarkdown(event.notes)}`}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label
            title="目标日期"
            text={event.targetDate}
            icon={{ source: Icon.Calendar, tintColor: Color.Blue }}
          />
          <Detail.Metadata.Label title="今天" text={snapshot.today} icon={Icon.Clock} />
          <Detail.Metadata.Separator />
          <Detail.Metadata.TagList title="日期选项">
            <Detail.Metadata.TagList.Item
              text={event.includeToday ? "✓ 含今天" : "− 不含今天"}
              color={event.includeToday ? Color.Green : Color.SecondaryText}
            />
            <Detail.Metadata.TagList.Item
              text={event.includeTarget ? "✓ 含目标日" : "− 不含目标日"}
              color={event.includeTarget ? Color.Green : Color.SecondaryText}
            />
          </Detail.Metadata.TagList>
          <Detail.Metadata.Label title="计算区间" text={range} />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="计算方式" text={event.mode === "workday" ? "中国工作日" : "自然日"} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          {!row.error && (
            <Action.Push
              title="查看假期日历"
              icon={Icon.Calendar}
              target={
                <HolidayCalendar
                  today={snapshot.today}
                  initialDate={event.targetDate}
                  event={event}
                  initialCalendar={snapshot.calendar}
                  onRefresh={updated}
                />
              }
            />
          )}
          <Action.Push
            title="编辑事项"
            icon={Icon.Pencil}
            shortcut={Keyboard.Shortcut.Common.Edit}
            target={<EventForm event={event} onSaved={updated} />}
          />
          <Action
            title="刷新事项"
            icon={Icon.ArrowClockwise}
            shortcut={Keyboard.Shortcut.Common.Refresh}
            onAction={updated}
          />
        </ActionPanel>
      }
    />
  );
}
