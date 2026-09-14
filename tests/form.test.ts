import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { EventRepository } from "../src/lib/repository";
import { MemoryStore } from "./support";

type Element = { type: unknown; props: Record<string, unknown> };
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const item = value as Element;
  return [item, ...elements(item.props.children)];
}
// Real form handlers with host navigation and hook state simulated outside Raycast.
function harness(nested: boolean) {
  const filename = resolve("src/components/event-form.tsx"),
    localRequire = createRequire(filename);
  const repository = new EventRepository(new MemoryStore());
  let location = "form",
    refreshed = false,
    cursor = 0;
  let pushed: Element | undefined;
  const states: unknown[] = [];
  const host = {
    Action: Object.assign(() => null, { SubmitForm: "submit" }),
    ActionPanel: "actions",
    Icon: { Calendar: "calendar" },
    Form: Object.assign(() => null, {
      TextField: "text",
      TextArea: "textarea",
      Dropdown: Object.assign(() => null, { Item: "item" }),
      Separator: "separator",
      Checkbox: "checkbox",
      Description: "description",
    }),
    useNavigation: () => ({
      pop: () => {
        if (nested) location = "list";
      },
      push: (element: Element) => {
        pushed = element;
      },
    }),
    popToRoot: async () => {
      location = "root";
    },
  };
  const exports: Record<string, unknown> = {};
  runInNewContext(
    ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    {
      exports,
      Error, // Match the application realm for errors thrown by imported validators.
      require: (name: string) => {
        if (name === "@raycast/api") return host;
        if (name === "./holiday-calendar") return { HolidayCalendar: "calendar" };
        if (name === "react")
          return {
            useState: (initial: unknown) => {
              const index = cursor++;
              if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
              return [
                states[index],
                (value: unknown) => {
                  states[index] = typeof value === "function" ? value(states[index]) : value;
                },
              ];
            },
          };
        if (name === "../lib/runtime")
          return {
            repository,
            timeZone: () => "Asia/Shanghai",
            savedToast: async () => undefined,
            showError: async (_title: string, error: unknown) => {
              throw error;
            },
          };
        return localRequire(name);
      },
    },
  );
  const render = () => {
    cursor = 0;
    return (exports.EventForm as (props: unknown) => Element)({
      onSaved: nested
        ? async () => {
            refreshed = true;
          }
        : undefined,
    });
  };
  const action = (title: string) => elements(render().props.actions).find((e) => e.props.title === title);
  const fields = () => elements(render().props.children);
  return {
    repository,
    location: () => location,
    refreshed: () => refreshed,
    submit: async (values: unknown) => {
      const submit = elements(render().props.actions).find((e) => e.type === "submit")!;
      await (submit.props.onSubmit as (v: unknown) => Promise<void>)(values);
    },
    change: (id: string, value: unknown) => {
      const field = fields().find((e) => e.props.id === id)!;
      (field.props.onChange as (v: unknown) => void)(value);
    },
    value: (id: string) => fields().find((e) => e.props.id === id)?.props.value,
    error: (id: string) => fields().find((e) => e.props.id === id)?.props.error,
    openCalendar: () => {
      const choose = action("从假期日历选择");
      assert.ok(choose, "form must expose calendar selection");
      (choose.props.onAction as () => void)();
      return pushed!;
    },
  };
}
const values = {
  title: "导航测试",
  targetDate: "2026-09-25",
  mode: "calendar",
  includeToday: false,
  includeTarget: true,
};
test("standalone create saves once then leaves the root form", async () => {
  const app = harness(false);
  await app.submit(values);
  assert.equal((await app.repository.list()).events.length, 1);
  assert.equal(app.location(), "root");
});
test("nested form saves and refreshes the list before returning", async () => {
  const app = harness(true);
  await app.submit(values);
  assert.equal((await app.repository.list()).events[0].title, "导航测试");
  assert.equal(app.refreshed(), true);
  assert.equal(app.location(), "list");
});
test("calendar selection fills only the date and preserves other form values", () => {
  const app = harness(false);
  app.change("title", "准备向媳妇求婚");
  app.change("mode", "calendar");
  app.change("includeToday", true);
  app.change("notes", "保留备注\n第二行");
  const calendar = app.openCalendar();
  (calendar.props.onSelect as (date: string) => void)("2026-10-01");
  assert.equal(app.value("targetDate"), "2026-10-01");
  assert.equal(app.value("title"), "准备向媳妇求婚");
  assert.equal(app.value("mode"), "calendar");
  assert.equal(app.value("includeToday"), true);
  assert.equal(app.value("notes"), "保留备注\n第二行");
});
test("opening and cancelling calendar leaves typed date and name untouched", () => {
  const app = harness(false);
  app.change("title", "保持内容");
  app.change("targetDate", "2026-10-22");
  app.change("notes", "取消也保留");
  app.openCalendar();
  assert.equal(app.value("targetDate"), "2026-10-22");
  assert.equal(app.value("title"), "保持内容");
  assert.equal(app.value("notes"), "取消也保留");
});

test("form saves notes and reports over-limit errors on notes rather than date", async () => {
  const app = harness(false);
  await app.submit({ ...values, notes: "字".repeat(1001) });
  assert.match(app.error("notes") as string, /1000/);
  assert.equal(app.error("targetDate"), undefined);
  assert.equal((await app.repository.list()).events.length, 0);
  await app.submit({ ...values, notes: "本地备注\n第二行" });
  assert.equal((await app.repository.list()).events[0].notes, "本地备注\n第二行");
});
