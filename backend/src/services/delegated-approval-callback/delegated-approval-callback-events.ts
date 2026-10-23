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

const DELEGATED_APPROVAL_CALLBACK_EVENTS = new Set<string>(Object.values(DelegatedApprovalCallbackEvent));

export const isDelegatedApprovalCallbackEvent = (eventType: string): eventType is DelegatedApprovalCallbackEvent =>
  DELEGATED_APPROVAL_CALLBACK_EVENTS.has(eventType);
