import { TTransaction } from "@app/domains/lib/transactions";

import { TEventInput } from "../models/emitted-event";
import { TEventEmitterService } from "../services/event-emitter/service";

// Records every event, and which ones joined a transaction.
export class FakeEventEmitterService implements TEventEmitterService {
  emitted: TEventInput[] = [];

  emittedInTransaction: { tx: TTransaction; events: TEventInput[] }[] = [];

  emit = async (events: TEventInput[]) => {
    this.emitted.push(...events);
  };

  within = (tx: TTransaction) => ({
    emit: async (events: TEventInput[]) => {
      this.emitted.push(...events);
      this.emittedInTransaction.push({ tx, events });
    }
  });
}
