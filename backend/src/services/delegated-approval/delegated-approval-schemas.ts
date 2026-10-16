import { z } from "zod";

import { DelegatedApprovalPolicyType } from "./delegated-approval-enums";

export const DelegatedApprovalSchema = z.object({
  type: z
    .nativeEnum(DelegatedApprovalPolicyType)
    .describe("The delegated approval system that reviews requests made against this policy."),
  connectionId: z.string().uuid().describe("The ID of the App Connection used to reach the delegated approval system.")
});
