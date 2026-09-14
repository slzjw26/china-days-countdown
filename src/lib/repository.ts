import { sortEvents, validateEvent, type CountdownEvent } from "./model";

export interface Store {
  getItem(key: string): Promise<string | undefined>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  allItems(): Promise<Record<string, unknown>>;
}

/** Per-event keys avoid lost updates when separate commands create different events. */
export class EventRepository {
  constructor(private readonly store: Store) {}

  async list(): Promise<{ events: CountdownEvent[]; invalidCount: number }> {
    const items = await this.store.allItems();
    const events: CountdownEvent[] = [];
    let invalidCount = 0;
    for (const [key, value] of Object.entries(items)) {
      if (!key.startsWith("event:")) continue;
      try {
        if (typeof value !== "string") throw new Error("Invalid record");
        const event = validateEvent(JSON.parse(value));
        if (key !== `event:${event.id}`) throw new Error("Mismatched ID");
        events.push(event);
      } catch {
        // Preserve corrupt records; never silently rewrite a partial event collection.
        invalidCount++;
      }
    }
    return { events: sortEvents(events), invalidCount };
  }

  async save(value: CountdownEvent): Promise<void> {
    const event = validateEvent(value);
    await this.store.setItem(`event:${event.id}`, JSON.stringify(event));
  }

  async remove(id: string): Promise<void> {
    await this.store.removeItem(`event:${id}`);
  }
  async getPinned(): Promise<string | undefined> {
    return this.store.getItem("settings:pinned");
  }
  async setPinned(id: string | undefined): Promise<void> {
    if (id) await this.store.setItem("settings:pinned", id);
    else await this.store.removeItem("settings:pinned");
  }
}
