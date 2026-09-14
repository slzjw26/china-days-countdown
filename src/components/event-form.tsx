import { Action, ActionPanel, Form, Icon, popToRoot, useNavigation } from "@raycast/api";
import { randomUUID } from "node:crypto";
import { useState } from "react";
import { interval, parseDay, todayInZone } from "../lib/dates";
import { HolidayCalendar } from "./holiday-calendar";
import { validateEvent, validateNotes, type CountdownEvent } from "../lib/model";
import { repository, savedToast, showError, timeZone } from "../lib/runtime";

interface Values {
  title: string;
  notes: string;
  targetDate: string;
  mode: string;
  includeToday: boolean;
  includeTarget: boolean;
}

export function EventForm({ event, onSaved }: { event?: CountdownEvent; onSaved?: () => Promise<void> }) {
  const { pop, push } = useNavigation();
  const [busy, setBusy] = useState(false);
  const [dateError, setDateError] = useState<string>();
  const [titleError, setTitleError] = useState<string>();
  const [notesError, setNotesError] = useState<string>();
  const [id] = useState(() => event?.id ?? randomUUID());
  const [draft, setDraft] = useState<Values>(() => ({
    title: event?.title ?? "",
    notes: event?.notes ?? "",
    targetDate: event?.targetDate ?? "",
    mode: event?.mode ?? "workday",
    includeToday: event?.includeToday ?? false,
    includeTarget: event?.includeTarget ?? true,
  }));

  function chooseDate() {
    const today = todayInZone(timeZone());
    let initialDate = draft.targetDate;
    try {
      parseDay(initialDate);
    } catch {
      initialDate = today;
    }
    push(
      <HolidayCalendar
        today={today}
        initialDate={initialDate}
        onSelect={(date) => {
          setDraft((previous) => ({ ...previous, targetDate: date }));
          setDateError(undefined);
        }}
      />,
    );
  }

  async function submit(values: Values) {
    if (busy) return;
    setTitleError(undefined);
    setDateError(undefined);
    setNotesError(undefined);
    if (!values.title.trim() || values.title.trim().length > 80) {
      setTitleError("名称须为 1–80 个字符");
      return;
    }
    try {
      validateNotes(values.notes);
    } catch (error) {
      setNotesError(error instanceof Error ? error.message : "请检查备注");
      return;
    }
    let candidate: CountdownEvent;
    try {
      candidate = validateEvent({ ...values, id });
      interval(todayInZone(timeZone()), candidate.targetDate, candidate);
    } catch (error) {
      setDateError(error instanceof Error ? error.message : "请检查输入");
      return;
    }
    setBusy(true);
    try {
      await repository.save(candidate);
      await savedToast(event ? "事件已更新" : "事件已创建");
      if (onSaved) {
        await onSaved();
        pop();
      } else {
        // The standalone command is already the root view; pop() would do nothing.
        await popToRoot({ clearSearchBar: true });
      }
    } catch (error) {
      await showError("保存失败", error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Form
      navigationTitle={event ? "编辑倒计时" : "创建倒计时"}
      isLoading={busy}
      actions={
        <ActionPanel>
          <Action.SubmitForm title={event ? "保存修改" : "创建事件"} onSubmit={submit} />
          <Action
            title="从假期日历选择"
            icon={Icon.Calendar}
            shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
            onAction={chooseDate}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="title"
        title="事件名称"
        placeholder="例如：准备向媳妇求婚"
        value={draft.title}
        error={titleError}
        onChange={(title) => {
          setDraft((previous) => ({ ...previous, title }));
          setTitleError(undefined);
        }}
      />
      <Form.TextField
        id="targetDate"
        title="目标日期"
        placeholder="YYYY-MM-DD"
        value={draft.targetDate}
        error={dateError}
        onChange={(targetDate) => {
          setDraft((previous) => ({ ...previous, targetDate }));
          setDateError(undefined);
        }}
        info="输入 YYYY-MM-DD，或按 ⌘⇧D 从假期日历选择（也可在 Actions 中打开）。1900–2199 年，未来最长 20 年。"
      />
      <Form.Dropdown
        id="mode"
        title="计算方式"
        info="工作日：排除周末和节假日，计入调休补班；自然日：每天都算。假期数据不完整时，工作日结果显示估算。"
        value={draft.mode}
        onChange={(mode) => setDraft((previous) => ({ ...previous, mode }))}
      >
        <Form.Dropdown.Item value="workday" title="中国工作日（含调休补班）" />
        <Form.Dropdown.Item value="calendar" title="自然日" />
      </Form.Dropdown>
      <Form.Separator />
      <Form.Checkbox
        id="includeToday"
        title="日期边界"
        label="计入今天"
        info="勾选后从今天开始计算。若今天就是目标日，两项都勾选才计一次；工作日模式下休息日仍不计。"
        value={draft.includeToday}
        onChange={(includeToday) => setDraft((previous) => ({ ...previous, includeToday }))}
      />
      <Form.Checkbox
        id="includeTarget"
        label="计入目标日"
        info="勾选后计算到目标日，未勾选则计算到前一天。工作日模式下休息日仍不计。"
        value={draft.includeTarget}
        onChange={(includeTarget) => setDraft((previous) => ({ ...previous, includeTarget }))}
      />
      <Form.Separator />
      <Form.TextArea
        id="notes"
        title="备注"
        placeholder="选填，记录与这个事项有关的信息"
        info="最多 1000 字，仅保存在本地，并在事项详情中展示。"
        value={draft.notes}
        error={notesError}
        onChange={(notes) => {
          setDraft((previous) => ({ ...previous, notes }));
          setNotesError(undefined);
        }}
      />
    </Form>
  );
}
