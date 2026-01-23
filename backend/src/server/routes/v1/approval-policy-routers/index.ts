import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import {
  CertRequestPolicyInputsSchema,
  CertRequestPolicySchema,
  CertRequestRequestGrantSchema,
  CertRequestRequestSchema,
  CreateCertRequestPolicySchema,
  CreateCertRequestRequestSchema,
  UpdateCertRequestPolicySchema
} from "@app/services/approval-policy/cert-request/cert-request-policy-schemas";
import {
  CreatePamAccessPolicySchema,
  CreatePamAccessRequestSchema,
  PamAccessPolicyInputsSchema,
  PamAccessPolicySchema,
  PamAccessRequestGrantSchema,
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
      requestResponseSchema: PamAccessRequestSchema,
      grantResponseSchema: PamAccessRequestGrantSchema,
      inputsSchema: PamAccessPolicyInputsSchema
    });
  },
  [ApprovalPolicyType.CertRequest]: async (server: FastifyZodProvider) => {
    registerApprovalPolicyEndpoints({
      server,
      policyType: ApprovalPolicyType.CertRequest,
      createPolicySchema: CreateCertRequestPolicySchema,
      updatePolicySchema: UpdateCertRequestPolicySchema,
      policyResponseSchema: CertRequestPolicySchema,
      createRequestSchema: CreateCertRequestRequestSchema,
      requestResponseSchema: CertRequestRequestSchema,
      grantResponseSchema: CertRequestRequestGrantSchema,
      inputsSchema: CertRequestPolicyInputsSchema
    });
  }
};
