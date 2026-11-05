import { v5 as uuidv5 } from "uuid";
import { z } from "zod";

import { DelegatedApprovalCallbackEvent } from "./delegated-approval-callback-enums";

// What the callback route emits once it has accepted a decision notification. The consumer that reads
// the decision back lives in delegated-approval-decision; the contract stays with the emitter.
export const DelegatedApprovalCallbackEventPayloadSchema = z.object({
  delegatedRequestId: z.string().uuid(),
  approvalRequestId: z.string().uuid(),
  orgId: z.string().uuid(),
  event: z.nativeEnum(DelegatedApprovalCallbackEvent),
  externalId: z.string().trim().min(1).max(255)
});

export type TDelegatedApprovalCallbackEventPayload = z.infer<typeof DelegatedApprovalCallbackEventPayloadSchema>;

// Namespaces the event ids derived below, so they can't collide with ids derived the same way elsewhere.
const DELEGATED_APPROVAL_CALLBACK_EVENT_ID_NAMESPACE = "6583d64a-24ad-474f-8de8-48cbd24dd1f3";

// One id per counted callback, so the read-back each one starts is its own outbox row.
export const buildDelegatedApprovalCallbackEventId = ({
  delegatedRequestId,
  attempts
}: {
  delegatedRequestId: string;
  attempts: number;
}): string => uuidv5(`${delegatedRequestId}:${attempts}`, DELEGATED_APPROVAL_CALLBACK_EVENT_ID_NAMESPACE);

const DELEGATED_APPROVAL_CALLBACK_EVENTS = new Set<string>(Object.values(DelegatedApprovalCallbackEvent));

export const isDelegatedApprovalCallbackEvent = (eventType: string): eventType is DelegatedApprovalCallbackEvent =>
  DELEGATED_APPROVAL_CALLBACK_EVENTS.has(eventType);
