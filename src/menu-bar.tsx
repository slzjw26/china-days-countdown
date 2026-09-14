import { Icon, launchCommand, LaunchType, MenuBarExtra } from "@raycast/api";
import { useCountdowns } from "./hooks/use-countdowns";
import { selectEvent } from "./lib/model";
import { selectionOptions } from "./lib/selection";
import { repository, showError, store } from "./lib/runtime";
import { menuTitle } from "./lib/snapshot";

export default function Command() {
  const { snapshot, isLoading, error, reload } = useCountdowns(true);
  const chosen =
    snapshot &&
    selectEvent(
      snapshot.rows.map((row) => row.event),
      snapshot.pinnedId,
      snapshot.today,
    );
  const row = snapshot?.rows.find((item) => item.event.id === chosen?.id);

  const options = selectionOptions(snapshot?.rows.map((item) => item.event) ?? [], snapshot?.pinnedId);
  async function pin(id?: string) {
    if (options.find((option) => option.id === id)?.disabled) return;
    try {
      await repository.setPinned(id);
      await reload();
    } catch (error) {
      await showError("设置失败", error);
    }
  }
  async function openList() {
    try {
      await launchCommand({ name: "countdowns", type: LaunchType.UserInitiated });
    } catch (error) {
      await showError("打开列表失败", error);
    }
  }
  if (!isLoading && snapshot && !snapshot.menuEnabled) return null;
  return (
    <MenuBarExtra
      icon={error ? Icon.Warning : Icon.Calendar}
      isLoading={isLoading}
      title={error ? "倒计时读取失败" : snapshot ? menuTitle(row) : "倒计时…"}
      tooltip={error ?? `${row?.event.title ?? "中国工作日倒计时"}${row?.warning ? `：${row.warning}` : ""}`}
    >
      <MenuBarExtra.Item title={`今天：${snapshot?.today ?? "加载中"}`} />
      {row && (
        <MenuBarExtra.Item
          title={`目标：${row.event.targetDate} · ${row.event.includeToday ? "含" : "不含"}今天 / ${row.event.includeTarget ? "含" : "不含"}目标日`}
        />
      )}
      {row?.warning && <MenuBarExtra.Item title={row.warning} icon={Icon.Warning} />}
      {row?.error && <MenuBarExtra.Item title={row.error} icon={Icon.Warning} />}
      {!!snapshot?.invalidCount && (
        <MenuBarExtra.Item title={`${snapshot.invalidCount} 条本地记录无法读取，原始数据已保留`} icon={Icon.Warning} />
      )}
      <MenuBarExtra.Separator />
      <MenuBarExtra.Item title="查看和管理倒计时" icon={Icon.List} onAction={openList} />
      <MenuBarExtra.Submenu title="选择显示事件" icon={Icon.Pin}>
        {options.map((option) => (
          <MenuBarExtra.Item
            key={option.id ?? "automatic"}
            title={option.selected ? "● " + option.title : option.title}
            onAction={option.disabled ? undefined : () => pin(option.id)}
          />
        ))}
      </MenuBarExtra.Submenu>
      <MenuBarExtra.Item title="刷新节假日数据" icon={Icon.ArrowClockwise} onAction={() => reload(true)} />
      <MenuBarExtra.Item
        title="隐藏菜单栏"
        onAction={async () => {
          try {
            await store.setItem("settings:menu-enabled", "false");
            await reload();
          } catch (error) {
            await showError("隐藏失败", error);
          }
        }}
      />
    </MenuBarExtra>
  );
}
