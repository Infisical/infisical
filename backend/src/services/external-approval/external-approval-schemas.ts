import { z } from "zod";

import { ExternalApprovalPolicyType } from "./external-approval-enums";

export const ExternalApprovalSchema = z.object({
  type: z
    .nativeEnum(ExternalApprovalPolicyType)
    .describe("The external approval system that reviews requests made against this policy."),
  connectionId: z.string().uuid().describe("The ID of the App Connection used to reach the external approval system.")
});
