import { TTransaction, TTransactionRunner } from "@app/domains/lib/transactions";

import { TEventInput } from "../../models/emitted-event";
import { TEventsMetrics, TEventsStores, TOutboxDelivery, TOutboxEntryStore } from "../dependencies";
import { buildDeliveries } from "../helpers/build-deliveries";
import { ConsumerRegistry } from "../helpers/consumer-registry";

// The only thing allowed on a caller's transaction: one insert, no lock, no network call.
export type TEventEmitterTransaction = {
  emit(events: TEventInput[]): Promise<void>;
};

export type TEventEmitterService = {
  // Writes the events on their own. Use within(tx) to commit them with a write.
  emit(events: TEventInput[]): Promise<void>;
  // Joins the caller's transaction, so the events commit or roll back with it.
  within(tx: TTransaction): TEventEmitterTransaction;
};

export class EventEmitterService implements TEventEmitterService {
  constructor(
    private readonly outboxEntryStore: TOutboxEntryStore,
    private readonly transactionRunner: TTransactionRunner<TEventsStores>,
    private readonly consumerRegistry: ConsumerRegistry,
    private readonly metrics: TEventsMetrics
  ) {}

  emit(events: TEventInput[]): Promise<void> {
    return this.write(events, (deliveries) => this.outboxEntryStore.insert(deliveries));
  }

  within(tx: TTransaction): TEventEmitterTransaction {
    const joined = this.transactionRunner.within(tx);
    return {
      emit: (events) =>
        this.write(events, (deliveries) => joined.run(({ stores }) => stores.outboxEntryStore.insert(deliveries)))
    };
  }

  // Don't catch a failed insert: the caller would be left with a poisoned transaction.
  private async write(events: TEventInput[], insert: (deliveries: TOutboxDelivery[]) => Promise<void>): Promise<void> {
    const deliveries = buildDeliveries(this.consumerRegistry, this.metrics, events);
    if (deliveries.length === 0) return;

    await insert(deliveries);
  }
}
