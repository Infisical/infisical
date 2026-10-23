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

// updatedAt is the attempt. Repeated retries of one failure share it and collapse on the outbox unique
// key. A request id alone would not: the previous row is still retained (delivered for a day, failed for
// 30 days), so a later resend has to insert beside it. The consumer's status write bumps updatedAt,
// which is what gives that resend a new key.
export const emitDelegatedApprovalDispatchRequested = (
  eventEmitter: TEventEmitter,
  { delegatedRequestId, updatedAt }: TDelegatedApprovalDispatchRequestedPayload & { updatedAt: Date },
  tx?: Knex
): Promise<void> =>
  eventEmitter.emit(
    {
      eventType: DELEGATED_APPROVAL_DISPATCH_REQUESTED_EVENT,
      idempotencyKey: `${DELEGATED_APPROVAL_DISPATCH_REQUESTED_EVENT}:${delegatedRequestId}:${updatedAt.toISOString()}`,
      payload: { delegatedRequestId }
    },
    tx
  );
