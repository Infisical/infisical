import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import {
  CreatePamAccessPolicySchema,
  CreatePamAccessRequestSchema,
  PamAccessPolicySchema,
  PamAccessRequestSchema,
  UpdatePamAccessPolicySchema
} from "@app/services/approval-policy/pam-access/pam-access-policy-schemas";

import { registerApprovalPolicyEndpoints } from "./approval-policy-endpoints";

export const APPROVAL_POLICY_REGISTER_ROUTER_MAP: Record<
  ApprovalPolicyType,
  (server: FastifyZodProvider) => Promise<void>
> = {
  [ApprovalPolicyType.PamAccess]: async (server: FastifyZodProvider) => {
    registerApprovalPolicyEndpoints({
      server,
      policyType: ApprovalPolicyType.PamAccess,
      createPolicySchema: CreatePamAccessPolicySchema,
      updatePolicySchema: UpdatePamAccessPolicySchema,
      policyResponseSchema: PamAccessPolicySchema,
      createRequestSchema: CreatePamAccessRequestSchema,
      requestResponseSchema: PamAccessRequestSchema
    });
  }
};
