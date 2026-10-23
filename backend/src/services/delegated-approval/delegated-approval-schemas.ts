import { z } from "zod";

import { DelegatedApprovalPolicyType, DelegatedApprovalRequestStatus } from "./delegated-approval-enums";

export const DelegatedApprovalSchema = z.object({
  type: z
    .nativeEnum(DelegatedApprovalPolicyType)
    .describe("The delegated approval system that reviews requests made against this policy."),
  connectionId: z.string().uuid().describe("The ID of the App Connection used to reach the delegated approval system.")
});

export const DelegatedApprovalRequestSchema = z.object({
  status: z
    .nativeEnum(DelegatedApprovalRequestStatus)
    .describe("Where the request stands in the delegated approval system that reviews it."),
  statusReason: z
    .string()
    .nullable()
    .describe("Why the request could not be sent to the delegated approval system, when it could not.")
});
