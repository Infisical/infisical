import { TTransactionRunner } from "@app/domains/lib/transactions";

import { TEventInput } from "../../models/emitted-event";
import { TEventsStores } from "../dependencies";
import { buildDeliveries } from "../helpers/build-deliveries";
import { ConsumerRegistry } from "../helpers/consumer-registry";

// The only thing that can run on a caller's transaction: one insert, with no lock and no network call, so
// the event commits or rolls back with the write it describes.
export type TEventsTransaction = {
  emit(events: TEventInput[]): Promise<void>;
};

export class EventsTransaction implements TEventsTransaction {
  constructor(
    private readonly transactionRunner: TTransactionRunner<TEventsStores>,
    private readonly consumerRegistry: ConsumerRegistry
  ) {}

  // A failed insert is not caught: swallowing it would hand the caller a poisoned transaction.
  async emit(events: TEventInput[]): Promise<void> {
    const deliveries = buildDeliveries(this.consumerRegistry, events);
    if (deliveries.length === 0) return;

    await this.transactionRunner.run(({ stores }) => stores.outboxEntryStore.insert(deliveries));
  }
}
