import { randomUUID } from "node:crypto";

export type TKekHistoryEntryRecord = {
  id: string;
  kekLabel: string;
  activatedAt: Date;
  supersededAt?: Date | null;
  retiredAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// Never pruned: it's how a restored dump gets matched to an archived key.
export class KekHistoryEntry {
  private constructor(
    readonly id: string,
    readonly kekLabel: string,
    readonly activatedAt: Date,
    private supersededOn: Date | null,
    private retiredOn: Date | null,
    private readonly createdAt: Date,
    private readonly updatedAt: Date
  ) {}

  static create(input: { kekLabel: string; activatedAt: Date }): KekHistoryEntry {
    const now = new Date();
    return new KekHistoryEntry(randomUUID(), input.kekLabel, input.activatedAt, null, null, now, now);
  }

  static restore(record: TKekHistoryEntryRecord): KekHistoryEntry {
    return new KekHistoryEntry(
      record.id,
      record.kekLabel,
      record.activatedAt,
      record.supersededAt ?? null,
      record.retiredAt ?? null,
      record.createdAt,
      record.updatedAt
    );
  }

  get supersededAt(): Date | null {
    return this.supersededOn;
  }

  get retiredAt(): Date | null {
    return this.retiredOn;
  }

  supersede(at: Date): void {
    this.supersededOn = at;
  }

  // The archived key was removed from the database.
  retire(at: Date): void {
    this.retiredOn = at;
  }

  toJSON(): TKekHistoryEntryRecord {
    return {
      id: this.id,
      kekLabel: this.kekLabel,
      activatedAt: this.activatedAt,
      supersededAt: this.supersededOn,
      retiredAt: this.retiredOn,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}
