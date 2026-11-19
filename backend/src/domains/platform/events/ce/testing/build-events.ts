import { TDomainQueue } from "@app/domains/lib/jobs";
import { FakeQueue } from "@app/domains/lib/jobs/testing/fake-queue";
import { InMemoryTransactionRunner } from "@app/domains/lib/transactions/testing/in-memory-transaction-runner";

import { IEventConsumer, TEventsStores } from "../services/dependencies";
import { EventsService } from "../services/events/service";
import { ConsumerRegistry } from "../services/helpers/consumer-registry";
import { FlushQueue } from "../services/helpers/flush-queue";
import { InMemoryOutboxEntryStore } from "./in-memory-outbox-entry-store";

export type TBuildEventsOptions = {
  consumers?: IEventConsumer[];
  isTelemetryEnabled?: boolean;
};

// The real service on in-memory stores: for tests of the domain, and of a consumer that needs the outbox's
// retries rather than a single handle() call.
export const buildEvents = ({ consumers = [], isTelemetryEnabled = false }: TBuildEventsOptions = {}) => {
  const outboxEntryStore = new InMemoryOutboxEntryStore();
  const transactionRunner = new InMemoryTransactionRunner<TEventsStores>(outboxEntryStore, (locks) => ({
    outboxEntryStore,
    locks
  }));
  const consumerRegistry = new ConsumerRegistry();
  const queue = new FakeQueue();
  const eventsService = new EventsService(
    outboxEntryStore,
    transactionRunner,
    consumerRegistry,
    new FlushQueue(queue as unknown as TDomainQueue),
    isTelemetryEnabled
  );
  consumers.forEach((consumer) => eventsService.registerConsumer(consumer));

  return { eventsService, outboxEntryStore, transactionRunner, consumerRegistry, queue };
};
