import type { TEventEmitter, TEventInput } from "@app/services/event-outbox/event-outbox-types";

import { TTransaction, unsealTransaction } from "./transaction-runner";

// Writes outbox events on a domain's own transaction, so an event commits or rolls back with the change it
// announces. The outbox is still a legacy service that takes a Knex transaction; this is the one place that
// hands it one.
export type TDomainEventEmitter = {
  emit: (events: TEventInput[], tx: TTransaction) => Promise<void>;
};

export const domainEventEmitter = (outbox: TEventEmitter): TDomainEventEmitter => ({
  emit: (events, tx) => outbox.emit(events, unsealTransaction(tx))
});
