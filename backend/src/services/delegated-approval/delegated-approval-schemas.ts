import { z } from "zod";

import { DelegatedApprovalPolicyType, DelegatedApprovalRequestStatus } from "./delegated-approval-enums";

export const DelegatedApprovalSchema = z.object({
  type: z
    .nativeEnum(DelegatedApprovalPolicyType)
    .describe("The delegated approval system that reviews requests made against this policy."),
  connectionId: z.string().uuid().describe("The ID of the App Connection used to reach the delegated approval system.")
});

// Shape of the `details` column. Bounds are enforced where values enter (toDelegatedApprovalStatusReason), so a
// stored row always reads back.
export const DelegatedApprovalRequestDetailsSchema = z.object({
  statusReason: z.string().nullable().optional()
});

export type TDelegatedApprovalRequestDetails = z.infer<typeof DelegatedApprovalRequestDetailsSchema>;

export const DelegatedApprovalRequestSchema = z.object({
  status: z
    .nativeEnum(DelegatedApprovalRequestStatus)
    .describe("Where the request stands in the delegated approval system that reviews it."),
  statusReason: z
    .string()
    .nullable()
    .describe("Why the request could not be sent to the delegated approval system, when it could not.")
});
