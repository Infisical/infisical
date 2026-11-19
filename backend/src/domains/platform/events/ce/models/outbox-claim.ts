import { EventResultStatus, OutboxEntry } from "./outbox-entry";
import { RetryBackoff } from "./retry-backoff";

export type TOutboxClaimRecord = {
  lockToken: string;
  entries: OutboxEntry[];
};

// The entries one worker holds, in the order they were written. Only this claim has the token, which is how
// the store tells it apart from a later claim on the same entries.
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

  // `id` is the event id. An entry with no result is settled as unaccounted for.
  settle(results: { id: string; status: EventResultStatus; error?: string }[], backoff: RetryBackoff): void {
    const byEventId = new Map(results.map((result) => [result.id, result]));
    this.entries.forEach((entry) => entry.settle(byEventId.get(entry.eventId), backoff));
  }
}
