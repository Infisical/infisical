import { randomUUID } from "node:crypto";

export type TKekHistoryEntryProps = {
  id: string;
  kekLabel: string;
  activatedAt: Date;
  supersededAt?: Date | null;
  retiredAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// Which encryption key wrapped the root key, and when. Never pruned: it is how a restored dump is matched to an
// archived key.
export class KekHistoryEntry {
  private constructor(private readonly props: TKekHistoryEntryProps) {}

  static create(input: { kekLabel: string; activatedAt: Date }): KekHistoryEntry {
    const now = new Date();
    return new KekHistoryEntry({
      id: randomUUID(),
      ...input,
      supersededAt: null,
      retiredAt: null,
      createdAt: now,
      updatedAt: now
    });
  }

  static restore(props: TKekHistoryEntryProps): KekHistoryEntry {
    return new KekHistoryEntry(props);
  }

  get id(): string {
    return this.props.id;
  }

  get kekLabel(): string {
    return this.props.kekLabel;
  }

  get activatedAt(): Date {
    return this.props.activatedAt;
  }

  get supersededAt(): Date | null {
    return this.props.supersededAt ?? null;
  }

  get retiredAt(): Date | null {
    return this.props.retiredAt ?? null;
  }

  toJSON(): TKekHistoryEntryProps {
    return this.props;
  }
}
