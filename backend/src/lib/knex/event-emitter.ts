import type { Knex } from "knex";

import { sealKnexTransaction } from "@app/domains/lib/transactions";
import type { TEventInput, TEventEmitterService } from "@app/domains/platform/events/ce/module";

// What legacy code (src/services/, src/ee/services/) takes to emit. Pass the caller's `tx` so the events commit
// with the write. Domains take `eventEmitterService: TEventEmitterService` instead.
export type TEventEmitter = {
  emit: (events: TEventInput[], tx?: Knex) => Promise<void>;
};

// A legacy `tx?: Knex` is sometimes a plain connection. Only a real transaction can be joined, anything else
// writes the events on their own, like before.
export const legacyEventEmitter = (eventEmitterService: TEventEmitterService): TEventEmitter => ({
  emit: (events, tx) =>
    tx?.isTransaction
      ? eventEmitterService.within(sealKnexTransaction(tx)).emit(events)
      : eventEmitterService.emit(events)
});
