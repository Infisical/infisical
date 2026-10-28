import { Knex } from "knex";
import { v5 as uuidv5 } from "uuid";
import { z } from "zod";

import { TEventEmitter } from "@app/services/event-outbox/event-outbox-types";

export const DELEGATED_APPROVAL_DISPATCH_REQUESTED_EVENT = "delegated-approval.request.dispatch-requested";

// Namespaces the event ids derived below, so they can't collide with ids derived the same way elsewhere.
const DELEGATED_APPROVAL_DISPATCH_REQUESTED_EVENT_ID_NAMESPACE = "95183bf5-9016-4f76-9263-b7682f7e6a14";

export const DelegatedApprovalDispatchRequestedPayloadSchema = z.object({
  delegatedRequestId: z.string().uuid()
});

export type TDelegatedApprovalDispatchRequestedPayload = z.infer<
  typeof DelegatedApprovalDispatchRequestedPayloadSchema
>;

// The id is derived from updatedAt, which is the attempt. Repeated retries of one failure share it and
// the outbox drops all but the first. A request id alone would not do: the previous row is still retained
// (delivered for a day, failed for 30 days), so a later resend has to insert beside it. The consumer's
// status write bumps updatedAt, which is what gives that resend a new id.
export const buildDelegatedApprovalDispatchRequestedEventId = ({
  delegatedRequestId,
  updatedAt
}: TDelegatedApprovalDispatchRequestedPayload & { updatedAt: Date }): string =>
  uuidv5(`${delegatedRequestId}:${updatedAt.toISOString()}`, DELEGATED_APPROVAL_DISPATCH_REQUESTED_EVENT_ID_NAMESPACE);

export const emitDelegatedApprovalDispatchRequested = (
  eventEmitter: TEventEmitter,
  { delegatedRequestId, updatedAt }: TDelegatedApprovalDispatchRequestedPayload & { updatedAt: Date },
  tx?: Knex
): Promise<void> =>
  eventEmitter.emit(
    [
      {
        id: buildDelegatedApprovalDispatchRequestedEventId({ delegatedRequestId, updatedAt }),
        type: DELEGATED_APPROVAL_DISPATCH_REQUESTED_EVENT,
        data: { delegatedRequestId }
      }
    ],
    tx
  );
