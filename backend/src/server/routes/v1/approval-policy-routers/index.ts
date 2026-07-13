import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import { BaseCheckPolicyMatchResponseSchema } from "@app/services/approval-policy/approval-policy-schemas";
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
  CodeSigningPolicyInputsSchema,
  CodeSigningPolicySchema,
  CodeSigningRequestGrantSchema,
  CodeSigningRequestSchema,
  CreateCodeSigningPolicySchema,
  CreateCodeSigningRequestSchema,
  UpdateCodeSigningPolicySchema
} from "@app/services/approval-policy/code-signing/code-signing-policy-schemas";

import { registerApprovalPolicyEndpoints } from "./approval-policy-endpoints";

// PamAccess is intentionally absent; PAM access requests are served only by /v1/pam/access-requests
export const APPROVAL_POLICY_REGISTER_ROUTER_MAP: Partial<
  Record<ApprovalPolicyType, (server: FastifyZodProvider) => Promise<void>>
> = {
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
      inputsSchema: CertRequestPolicyInputsSchema,
      checkPolicyMatchResponseSchema: BaseCheckPolicyMatchResponseSchema
    });
  },
  [ApprovalPolicyType.CertCodeSigning]: async (server: FastifyZodProvider) => {
    registerApprovalPolicyEndpoints({
      server,
      policyType: ApprovalPolicyType.CertCodeSigning,
      createPolicySchema: CreateCodeSigningPolicySchema,
      updatePolicySchema: UpdateCodeSigningPolicySchema,
      policyResponseSchema: CodeSigningPolicySchema,
      createRequestSchema: CreateCodeSigningRequestSchema,
      requestResponseSchema: CodeSigningRequestSchema,
      grantResponseSchema: CodeSigningRequestGrantSchema,
      inputsSchema: CodeSigningPolicyInputsSchema,
      checkPolicyMatchResponseSchema: BaseCheckPolicyMatchResponseSchema
    });
  }
};
