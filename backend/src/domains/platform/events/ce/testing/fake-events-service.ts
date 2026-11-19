/* eslint-disable class-methods-use-this */
import { TTransaction } from "@app/domains/lib/transactions";

import { TEventInput } from "../models/emitted-event";
import { IEventConsumer } from "../services/dependencies";
import { TEventsService } from "../services/events/service";

// For tests of code that emits: records every event, and which ones joined a transaction.
export class FakeEventsService implements TEventsService {
  emitted: TEventInput[] = [];

  emittedInTransaction: { tx: TTransaction; events: TEventInput[] }[] = [];

  consumers: IEventConsumer[] = [];

  emit = async (events: TEventInput[]) => {
    this.emitted.push(...events);
  };

  within = (tx: TTransaction) => ({
    emit: async (events: TEventInput[]) => {
      this.emitted.push(...events);
      this.emittedInTransaction.push({ tx, events });
    }
  });

  registerConsumer = (consumer: IEventConsumer) => {
    this.consumers.push(consumer);
  };

  drain = async () => ({ handled: 0, unknownConsumer: false });
}
