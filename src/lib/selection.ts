import { sortEvents, type CountdownEvent } from "./model";

/** Resolve deleted pins exactly like automatic countdown selection. */
export function selectionOptions(events: CountdownEvent[], pinnedId?: string) {
  const active = events.some((event) => event.id === pinnedId) ? pinnedId : undefined;
  return [
    { id: undefined as string | undefined, title: "自动：最近未过期事项" },
    ...sortEvents(events).map((event, index) => ({
      id: event.id,
      title: `${index + 1}. ${event.title} · ${event.targetDate}`,
    })),
  ].map((option) => ({ ...option, selected: option.id === active, disabled: option.id === active }));
}
