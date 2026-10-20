import { Knex } from "knex";
import { z } from "zod";

import { TEventEmitter } from "@app/services/event-outbox/event-outbox-types";

export const DELEGATED_APPROVAL_DISPATCH_REQUESTED_EVENT = "delegated-approval.request.dispatch-requested";

export const DelegatedApprovalDispatchRequestedPayloadSchema = z.object({
  delegatedRequestId: z.string().uuid()
});

export type TDelegatedApprovalDispatchRequestedPayload = z.infer<
  typeof DelegatedApprovalDispatchRequestedPayloadSchema
>;

// No idempotency key on purpose: a user retry has to insert a fresh row while the delivered one from the
// first attempt is still retained, and the consumer already skips a request that was delivered.
export const emitDelegatedApprovalDispatchRequested = (
  eventEmitter: TEventEmitter,
  { delegatedRequestId }: TDelegatedApprovalDispatchRequestedPayload,
  tx?: Knex
): Promise<void> =>
  eventEmitter.emit(
    {
      eventType: DELEGATED_APPROVAL_DISPATCH_REQUESTED_EVENT,
      payload: { delegatedRequestId }
    },
    tx
  );
