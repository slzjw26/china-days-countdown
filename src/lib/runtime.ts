import { getPreferenceValues, launchCommand, LaunchType, LocalStorage, showToast, Toast } from "@raycast/api";
import { EventRepository, type Store } from "./repository";

export const store: Store = {
  getItem: (key) => LocalStorage.getItem<string>(key),
  setItem: (key, value) => LocalStorage.setItem(key, value),
  removeItem: (key) => LocalStorage.removeItem(key),
  allItems: () => LocalStorage.allItems(),
};
export const repository = new EventRepository(store);
export const timeZone = () => getPreferenceValues<{ timeZone: string }>().timeZone;

/** A saved event remains saved even when Raycast declines a menu refresh. */
export async function refreshMenu(): Promise<boolean> {
  try {
    if ((await store.getItem("settings:menu-enabled")) === "true") {
      await launchCommand({ name: "menu-bar", type: LaunchType.Background });
    }
    return true;
  } catch {
    return false;
  }
}

export async function savedToast(title: string): Promise<void> {
  const refreshed = await refreshMenu();
  await showToast({
    style: Toast.Style.Success,
    title,
    message: refreshed ? undefined : "数据已保存，菜单栏待下次刷新",
  });
}

export async function showError(title: string, error: unknown): Promise<void> {
  await showToast({ style: Toast.Style.Failure, title, message: error instanceof Error ? error.message : "请重试" });
}
