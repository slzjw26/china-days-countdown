import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { countDays } from "../src/lib/dates";
import { emptyCalendar, type Calendar } from "../src/lib/holidays";

type Element = { props: Record<string, unknown> };
type Effect = { dependencies: unknown[]; cleanup?: () => void };

function descendants(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(descendants);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const element = value as Element;
  return [element, ...descendants(element.props.children)];
}

/** Execute the actual calendar component with controlled host hooks and delayed downloads. */
function harness(selectable = false) {
  const filename = resolve("src/components/holiday-calendar.tsx");
  const localRequire = createRequire(filename);
  const initial = emptyCalendar();
  initial.bulletins[2026] = { papers: ["notice"], state: "ready" };
  const refreshed = emptyCalendar();
  refreshed.bulletins[2026] = { papers: ["notice"], state: "ready" };
  refreshed.days.set("2026-09-25", true);
  refreshed.details.set("2026-09-25", { name: "中秋节", isOffDay: true, bulletinYear: 2026 });
  const event = {
    id: "calendar-race",
    title: "刷新测试",
    targetDate: "2026-09-25",
    mode: "workday" as const,
    includeToday: false,
    includeTarget: true,
  };
  let release: ((value: Calendar) => void) | undefined;
  const states: unknown[] = [];
  const parentCounts: number[] = [];
  let chosenDate: string | undefined;
  let cursor = 0;
  let effects: (() => void)[] = [];
  const same = (left: unknown[], right: unknown[]) =>
    left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const hooks = {
    useState(initialValue: unknown) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initialValue === "function" ? initialValue() : initialValue;
      return [
        states[index],
        (value: unknown) => {
          states[index] = typeof value === "function" ? value(states[index]) : value;
        },
      ];
    },
    useRef(value: unknown) {
      const index = cursor++;
      return states[index] ?? (states[index] = { current: value });
    },
    useCallback(callback: unknown, dependencies: unknown[]) {
      const index = cursor++;
      const old = states[index] as { callback: unknown; dependencies: unknown[] } | undefined;
      if (!old || !same(old.dependencies, dependencies)) states[index] = { callback, dependencies };
      return (states[index] as { callback: unknown }).callback;
    },
    useEffect(callback: () => (() => void) | undefined, dependencies: unknown[]) {
      const index = cursor++;
      const old = states[index] as Effect | undefined;
      if (!old || !same(old.dependencies, dependencies)) {
        effects.push(() => {
          old?.cleanup?.();
          states[index] = { dependencies, cleanup: callback() };
        });
      }
    },
  };
  const host = {
    Action: Object.assign(() => null, { CopyToClipboard: "copy", OpenInBrowser: "open" }),
    ActionPanel: Object.assign(() => null, { Section: "section", Submenu: "submenu" }),
    Grid: Object.assign(() => null, {
      Dropdown: Object.assign(() => null, { Item: "dropdown-item" }),
      Section: "grid-section",
      Item: "grid-item",
    }),
    Icon: new Proxy({}, { get: (_target, key) => key }),
    Keyboard: { Shortcut: { Common: { Refresh: {} } } },
    useNavigation: () => ({ pop: () => undefined }),
  };
  const exports: Record<string, unknown> = {};
  runInNewContext(
    ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      Buffer,
      require(name: string) {
        if (name === "react") return hooks;
        if (name === "@raycast/api") return host;
        if (name === "../lib/runtime") return { store: {} };
        if (name === "../lib/holidays")
          return {
            ...localRequire(name),
            loadCalendar: async (_years: number[], _store: unknown, _fetch: unknown, _now: number, force: boolean) =>
              force
                ? await new Promise<Calendar>((resolve) => {
                    release = resolve;
                  })
                : emptyCalendar(),
          };
        return localRequire(name);
      },
    },
  );
  const onRefresh = async () => {
    const current = states.find((value): value is Calendar =>
      Boolean(value && typeof value === "object" && "bulletins" in value),
    )!;
    parentCounts.push(countDays("2026-09-14", event.targetDate, event, current.days));
  };
  function render() {
    cursor = 0;
    effects = [];
    const tree = (exports.HolidayCalendar as (props: unknown) => Element)({
      today: "2026-09-14",
      initialDate: event.targetDate,
      initialCalendar: initial,
      event,
      onRefresh,
      onSelect: selectable
        ? (date: string) => {
            chosenDate = date;
          }
        : undefined,
    });
    effects.forEach((effect) => effect());
    return tree;
  }
  return {
    render,
    parentCounts,
    chosenDate: () => chosenDate,
    action(title: string) {
      const action = descendants(render().props.actions).find((element) => element.props.title === title);
      assert.ok(action, `missing action: ${title}`);
      return (action.props.onAction as () => Promise<void> | void)();
    },
    finishRefresh() {
      assert.ok(release, "the forced download must have started");
      release(refreshed);
    },
  };
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test("switching month during a forced refresh keeps calendar and parent on the new snapshot", async () => {
  const app = harness();
  app.render();
  await settle();
  const refresh = app.action("刷新假期数据");
  await settle();
  app.action("下个月");
  app.render();
  await settle();
  app.finishRefresh();
  await refresh;
  await settle();
  assert.deepEqual(app.parentCounts, [8], "parent refresh must follow adoption of the new calendar");
  assert.equal(app.render().props.navigationTitle, "假期日历 · 8 工作日");
});

test("adjacent-month cells show their own explanation and return their actual date", async () => {
  const app = harness(true);
  app.render();
  await settle();
  const tree = app.render();
  (tree.props.onSelectionChange as (id: string) => void)("2026-10-01");
  const selectedTree = app.render();
  const section = descendants(selectedTree.props.children).find((item) => typeof item.props.subtitle === "string");
  assert.match(section!.props.subtitle as string, /2026-10-01/);
  const day = descendants(selectedTree.props.children).find((item) => item.props.id === "2026-10-01");
  assert.ok(day, "month padding must contain a selectable date");
  const choose = descendants(day.props.actions).find((item) => item.props.title === "选择此日期");
  assert.ok(choose);
  (choose.props.onAction as () => void)();
  assert.equal(app.chosenDate(), "2026-10-01");
});
