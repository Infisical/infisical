import { DatabaseError } from "@app/lib/errors";

import { KekHistoryEntry, TKekHistoryEntryRecord } from "../models/kek-history-entry";
import { TKekHistoryStore } from "../services/dependencies";

export class InMemoryKekHistoryStore implements TKekHistoryStore {
  private rows = new Map<string, TKekHistoryEntryRecord>();

  async findPage({ offset, limit }: { offset: number; limit: number }) {
    return this.newestFirst()
      .slice(offset, offset + limit)
      .map((row) => KekHistoryEntry.restore(row));
  }

  async count() {
    return this.rows.size;
  }

  async findActiveByLabel(kekLabel: string) {
    const row = this.newestFirst().find((entry) => entry.kekLabel === kekLabel && !entry.retiredAt);
    return row ? KekHistoryEntry.restore(row) : null;
  }

  async findCurrent() {
    const row = this.newestFirst().find((entry) => !entry.supersededAt);
    return row ? KekHistoryEntry.restore(row) : null;
  }

  async insert(entry: KekHistoryEntry) {
    const record = entry.toJSON();
    if (this.rows.has(record.id)) {
      throw new DatabaseError({
        error: new Error("duplicate key value violates unique constraint"),
        name: "Insert KEK history entry"
      });
    }
    this.rows.set(record.id, { ...record, supersededAt: null, retiredAt: null });
  }

  async save(entry: KekHistoryEntry) {
    const record = entry.toJSON();
    const row = this.rows.get(record.id);
    if (row) this.rows.set(record.id, { ...row, supersededAt: record.supersededAt, retiredAt: record.retiredAt });
  }

  snapshot(): unknown {
    return new Map(this.rows);
  }

  restore(snapshot: unknown) {
    this.rows = new Map(snapshot as Map<string, TKekHistoryEntryRecord>);
  }

  private newestFirst() {
    return [...this.rows.values()].sort((a, b) => b.activatedAt.getTime() - a.activatedAt.getTime());
  }
}
