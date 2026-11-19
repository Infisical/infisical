import type { Knex } from "knex";

import { sealKnexTransaction } from "@app/domains/lib/transactions";
import type { TEventInput, TEventEmitterService } from "@app/domains/platform/events/ce/module";

// What code under src/services/ and src/ee/services/ depends on to emit. Pass the caller's `tx` so the events
// commit with the business write. A domain takes `eventEmitterService: TEventEmitterService` instead.
export type TEventEmitter = {
  emit: (events: TEventInput[], tx?: Knex) => Promise<void>;
};

// Legacy `tx?: Knex` is sometimes a plain primary connection, not a transaction. Only a transaction can be
// joined; anything else writes the events on their own, as it did before.
export const legacyEventEmitter = (eventEmitterService: TEventEmitterService): TEventEmitter => ({
  emit: (events, tx) =>
    tx?.isTransaction
      ? eventEmitterService.within(sealKnexTransaction(tx)).emit(events)
      : eventEmitterService.emit(events)
});
