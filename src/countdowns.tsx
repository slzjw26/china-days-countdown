import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  Icon,
  Keyboard,
  launchCommand,
  LaunchType,
  List,
  openExtensionPreferences,
} from "@raycast/api";
import { EventForm } from "./components/event-form";
import { EventDetail } from "./components/event-detail";
import { selectionOptions } from "./lib/selection";
import { useCountdowns } from "./hooks/use-countdowns";
import { repository, savedToast, showError, store, timeZone } from "./lib/runtime";
import type { CountdownRow } from "./lib/snapshot";

export default function Command() {
  const { snapshot, isLoading, error, reload } = useCountdowns();

  const fixedId = selectionOptions(snapshot?.rows.map((row) => row.event) ?? [], snapshot?.pinnedId).find(
    (option) => option.selected,
  )?.id;

  async function pin(id?: string) {
    if (id === fixedId) return;
    try {
      await repository.setPinned(id);
      await savedToast(id ? "已固定菜单栏事件" : "菜单栏自动选择最近事件");
      await reload();
    } catch (error) {
      await showError("设置失败", error);
    }
  }
  async function remove(row: CountdownRow) {
    if (
      !(await confirmAlert({
        title: `删除“${row.event.title}”？`,
        message: "删除后无法恢复。",
        primaryAction: { title: "删除", style: Alert.ActionStyle.Destructive },
      }))
    )
      return;
    try {
      await repository.remove(row.event.id);
      await savedToast("事件已删除");
      await reload();
    } catch (error) {
      await showError("删除失败", error);
    }
  }
  async function enableMenu() {
    try {
      await store.setItem("settings:menu-enabled", "true");
      await launchCommand({ name: "menu-bar", type: LaunchType.Background });
      await reload();
    } catch (error) {
      await showError("菜单栏启用失败，请运行倒计时菜单栏命令", error);
    }
  }

  function actions(row?: CountdownRow) {
    return (
      <ActionPanel>
        {row && (
          <Action.Push
            title="查看事项详情"
            icon={Icon.Document}
            target={<EventDetail eventId={row.event.id} onChanged={reload} />}
          />
        )}
        {row && (
          <Action.Push
            title="编辑事项"
            icon={Icon.Pencil}
            shortcut={Keyboard.Shortcut.Common.Edit}
            target={<EventForm event={row.event} onSaved={reload} />}
          />
        )}
        <Action.Push
          title="创建事件"
          icon={Icon.Plus}
          shortcut={Keyboard.Shortcut.Common.New}
          target={<EventForm onSaved={reload} />}
        />
        <ActionPanel.Section title={fixedId ? "菜单栏 · ● 固定事项" : "菜单栏 · ● 自动选择"}>
          {row && row.event.id !== fixedId && (
            <Action title="固定此事项到菜单栏" icon={Icon.Pin} onAction={() => pin(row.event.id)} />
          )}
          {fixedId && <Action title="自动选择最近事项" icon={Icon.ArrowClockwise} onAction={() => pin()} />}
          <Action title="启用菜单栏" icon={Icon.AppWindowSidebarLeft} onAction={enableMenu} />
        </ActionPanel.Section>
        <ActionPanel.Section>
          <Action
            title="刷新节假日数据"
            icon={Icon.ArrowClockwise}
            shortcut={Keyboard.Shortcut.Common.Refresh}
            onAction={async () => {
              await reload(true);
              await savedToast("列表已刷新，请留意数据状态提示");
            }}
          />
          <Action title="设置日期时区" icon={Icon.Gear} onAction={openExtensionPreferences} />
          {row && (
            <Action
              title="删除事件"
              icon={Icon.Trash}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["cmd"], key: "backspace" }}
              onAction={() => remove(row)}
            />
          )}
        </ActionPanel.Section>
      </ActionPanel>
    );
  }

  function item(row: CountdownRow) {
    const { event } = row;
    const mode = event.mode === "workday" ? "工作日" : "自然日";
    const count = row.error
      ? "日期超限"
      : row.expired
        ? "已过期"
        : `${row.estimated ? "≈ " : ""}${row.remaining} ${mode}`;
    return (
      <List.Item
        key={event.id}
        id={event.id}
        title={event.title}
        icon={Icon.Calendar}
        accessories={[
          { text: event.targetDate, tooltip: `目标日期：${event.targetDate}` },
          ...(snapshot?.pinnedId === event.id ? [{ icon: Icon.Pin, tooltip: "菜单栏固定事件" }] : []),
          ...(row.warning || row.error
            ? [{ icon: { source: Icon.Warning, tintColor: Color.Orange }, tooltip: row.error ?? row.warning }]
            : []),
          {
            tag: {
              value: count,
              color: row.expired ? Color.SecondaryText : row.estimated || row.error ? Color.Orange : Color.Green,
            },
          },
        ]}
        actions={actions(row)}
      />
    );
  }

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="搜索倒数事件…"
      navigationTitle={`倒计时 · ${snapshot?.today ?? "加载中"}`}
    >
      {error && <List.Item title="读取失败" subtitle={error} icon={Icon.Warning} actions={actions()} />}
      {!!snapshot?.invalidCount && (
        <List.Item
          title={`${snapshot.invalidCount} 条本地记录无法读取`}
          subtitle="原始数据已保留，未自动删除"
          icon={Icon.Warning}
          actions={actions()}
        />
      )}
      <List.EmptyView
        title={isLoading ? "正在读取倒计时…" : "添加第一个倒数事件"}
        description={isLoading ? "正在加载本地数据和节假日" : "支持自然日与中国工作日，⌘N 创建事件"}
        icon={Icon.Calendar}
        actions={actions()}
      />
      <List.Section title={`即将到来 · ${timeZone() === "system" ? "系统时区" : "中国时间"}`}>
        {snapshot?.rows.filter((row) => !row.expired).map(item)}
      </List.Section>
      <List.Section title="已过期">{snapshot?.rows.filter((row) => row.expired).map(item)}</List.Section>
    </List>
  );
}
