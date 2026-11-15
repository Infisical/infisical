import { z } from "zod";

import { DelegatedApprovalPolicyType, DelegatedApprovalRequestStatus } from "./delegated-approval-enums";
import { DELEGATED_APPROVAL_PROVIDER_RECORD_NUMBER_MAX_CHARS } from "./dispatch/delegated-approval-dispatch-constants";

export const DelegatedApprovalSchema = z.object({
  type: z
    .nativeEnum(DelegatedApprovalPolicyType)
    .describe("The delegated approval system that reviews requests made against this policy."),
  connectionId: z.string().uuid().describe("The ID of the App Connection used to reach the delegated approval system.")
});

export const DelegatedApprovalProviderDetailsSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(DelegatedApprovalPolicyType.ServiceNow),
    recordNumber: z
      .string()
      .min(1)
      .max(DELEGATED_APPROVAL_PROVIDER_RECORD_NUMBER_MAX_CHARS)
      .describe("The number of the ServiceNow record that tracks this request, as shown in ServiceNow.")
  })
]);

// Shape of the `details` column. Bounds are enforced where values enter (the provider response schemas
// and toDelegatedApprovalStatusReason), so a stored row always reads back.
export const DelegatedApprovalRequestDetailsSchema = z.object({
  statusReason: z.string().nullable().optional(),
  provider: DelegatedApprovalProviderDetailsSchema.optional()
});

export type TDelegatedApprovalProviderDetails = z.infer<typeof DelegatedApprovalProviderDetailsSchema>;
export type TDelegatedApprovalRequestDetails = z.infer<typeof DelegatedApprovalRequestDetailsSchema>;

export const DelegatedApprovalRequestSchema = z.object({
  status: z
    .nativeEnum(DelegatedApprovalRequestStatus)
    .describe("Where the request stands in the delegated approval system that reviews it."),
  statusReason: z
    .string()
    .nullable()
    .describe(
      "Why the request is not progressing in, or could not be completed by, the delegated approval system, when that is the case."
    ),
  provider: DelegatedApprovalProviderDetailsSchema.nullable().describe(
    "How the delegated approval system identifies this request to its own users, when it reported that."
  )
});
