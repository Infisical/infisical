import { EventResultStatus, OutboxEntry } from "./outbox-entry";

export type TOutboxClaimRecord = {
  lockToken: string;
  entries: OutboxEntry[];
};

// The entries one worker holds, in write order. The token fences it from a later claim on the same entries.
export class OutboxClaim {
  private constructor(
    readonly lockToken: string,
    readonly entries: OutboxEntry[]
  ) {}

  static restore({ lockToken, entries }: TOutboxClaimRecord): OutboxClaim {
    return new OutboxClaim(lockToken, entries);
  }

  get isEmpty(): boolean {
    return this.entries.length === 0;
  }

  entryIds(): string[] {
    return this.entries.map((entry) => entry.id);
  }

  // `id` is the event id. An entry without a result gets retried.
  settle(results: { id: string; status: EventResultStatus; error?: string }[]): void {
    const byEventId = new Map(results.map((result) => [result.id, result]));
    this.entries.forEach((entry) => entry.settle(byEventId.get(entry.eventId)));
  }
}
