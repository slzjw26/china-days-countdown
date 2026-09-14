import type { Store } from "../src/lib/repository";

// Only the external storage boundary is replaced; repository behavior stays real.
export class MemoryStore implements Store {
  private values = new Map<string, string>();
  async getItem(key: string) {
    return this.values.get(key);
  }
  async setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  async removeItem(key: string) {
    this.values.delete(key);
  }
  async allItems() {
    return Object.fromEntries(this.values);
  }
}
