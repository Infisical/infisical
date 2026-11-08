import { TKekHistoryDataAccess } from "../data-access/kek-history-data-access";
import { KekHistoryEntry } from "../model/kek-history-entry";
import { InMemoryKmsCoreState } from "./in-memory-kms-core-state";

export class InMemoryKekHistoryDataAccess implements TKekHistoryDataAccess {
  constructor(private readonly state: InMemoryKmsCoreState) {}

  async findPage({ offset, limit }: { offset: number; limit: number }) {
    return this.sorted()
      .slice(offset, offset + limit)
      .map((row) => KekHistoryEntry.restore(row));
  }

  async count() {
    return this.state.tables.kekHistory.size;
  }

  async findActiveByLabel(kekLabel: string) {
    const row = this.sorted().find((entry) => entry.kekLabel === kekLabel && !entry.retiredAt);
    return row ? KekHistoryEntry.restore(row) : undefined;
  }

  async findCurrent() {
    const row = this.sorted().find((entry) => !entry.supersededAt);
    return row ? KekHistoryEntry.restore(row) : undefined;
  }

  async create(entry: KekHistoryEntry) {
    const props = entry.toJSON();
    this.state.tables.kekHistory.set(props.id, props);
  }

  async markSuperseded(id: string, at: Date) {
    this.patch(id, { supersededAt: at });
  }

  async markRetired(id: string, at: Date) {
    this.patch(id, { retiredAt: at });
  }

  private patch(id: string, patch: { supersededAt?: Date; retiredAt?: Date }) {
    const row = this.state.tables.kekHistory.get(id);
    if (row) this.state.tables.kekHistory.set(id, { ...row, ...patch });
  }

  private sorted() {
    return [...this.state.tables.kekHistory.values()].sort((a, b) => b.activatedAt.getTime() - a.activatedAt.getTime());
  }
}
