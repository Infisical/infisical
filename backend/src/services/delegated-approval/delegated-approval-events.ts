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

// The event id is the request's dispatchEventId. A resend stores a new one, and the consumer skips any event
// whose id no longer matches, so an older event still in backoff can't dispatch or close the request.
export const emitDelegatedApprovalDispatchRequested = (
  eventEmitter: TEventEmitter,
  { delegatedRequestId, dispatchEventId }: TDelegatedApprovalDispatchRequestedPayload & { dispatchEventId: string },
  tx?: Knex
): Promise<void> =>
  eventEmitter.emit(
    [
      {
        id: dispatchEventId,
        type: DELEGATED_APPROVAL_DISPATCH_REQUESTED_EVENT,
        data: { delegatedRequestId }
      }
    ],
    tx
  );
