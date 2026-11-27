import { TDomainQueue } from "@app/domains/lib/jobs";
import { FakeQueue } from "@app/domains/lib/jobs/testing/fake-queue";
import { InMemoryTransactionRunner } from "@app/domains/lib/transactions/testing/in-memory-transaction-runner";

import { TEventConsumer, TEventsStores } from "../services/dependencies";
import { EventDeliveryService } from "../services/event-delivery/service";
import { EventEmitterService } from "../services/event-emitter/service";
import { ConsumerRegistry } from "../services/helpers/consumer-registry";
import { FlushQueue } from "../services/helpers/flush-queue";
import { FakeEventsMetrics } from "./fake-events-metrics";
import { InMemoryOutboxEntryStore } from "./in-memory-outbox-entry-store";

type TBuildEventsOptions = {
  consumers?: TEventConsumer[];
  isTelemetryEnabled?: boolean;
};

// The real services on in-memory stores, for domain tests and for a consumer test that needs real retries.
export const buildEvents = ({ consumers = [], isTelemetryEnabled = false }: TBuildEventsOptions = {}) => {
  const outboxEntryStore = new InMemoryOutboxEntryStore();
  const transactionRunner = new InMemoryTransactionRunner<TEventsStores>(outboxEntryStore, (locks) => ({
    outboxEntryStore,
    locks
  }));
  const consumerRegistry = new ConsumerRegistry();
  const queue = new FakeQueue();
  const metrics = new FakeEventsMetrics(isTelemetryEnabled);
  const eventEmitterService = new EventEmitterService(outboxEntryStore, transactionRunner, consumerRegistry, metrics);
  const eventDeliveryService = new EventDeliveryService(
    outboxEntryStore,
    transactionRunner,
    consumerRegistry,
    new FlushQueue(queue as unknown as TDomainQueue),
    metrics
  );
  consumers.forEach((consumer) => consumerRegistry.register(consumer));

  return {
    eventEmitterService,
    eventDeliveryService,
    outboxEntryStore,
    transactionRunner,
    consumerRegistry,
    queue,
    metrics
  };
};
