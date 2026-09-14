import { useCallback, useEffect, useRef, useState } from "react";
import { environment, LaunchType } from "@raycast/api";
import { loadSnapshot, type Snapshot } from "../lib/snapshot";
import { store, timeZone } from "../lib/runtime";

/** Ignore older async results after reload/unmount; always release Raycast's loading state. */
export function useCountdowns(menu = false) {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const sequence = useRef(0);
  const reload = useCallback(async (force = false) => {
    const ticket = ++sequence.current;
    setLoading(true);
    setError(undefined);
    try {
      const value = await loadSnapshot(store, timeZone(), force);
      if (ticket === sequence.current) setSnapshot(value);
    } catch (error) {
      if (ticket === sequence.current) setError(error instanceof Error ? error.message : "读取失败，请重试");
    } finally {
      if (ticket === sequence.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    async function initialize() {
      try {
        if (menu && environment.launchType === LaunchType.UserInitiated)
          await store.setItem("settings:menu-enabled", "true");
        await reload();
      } catch (error) {
        setError(error instanceof Error ? error.message : "读取失败");
        setLoading(false);
      }
    }
    void initialize();
    // View commands stay fresh across midnight. Menu commands use Raycast's scheduler.
    const timer = menu ? undefined : setInterval(() => void reload(), 60_000);
    return () => {
      sequence.current++;
      if (timer) clearInterval(timer);
    };
  }, [menu, reload]);
  return { snapshot, isLoading, error, reload };
}
