import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import { BaseCheckPolicyMatchResponseSchema } from "@app/services/approval-policy/approval-policy-schemas";
import {
  CertRequestPolicyInputsSchema,
  CertRequestPolicySchema,
  CertRequestRequestGrantSchema,
  CertRequestRequestSchema,
  CreateCertRequestPolicySchema,
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
      requestResponseSchema: CertRequestRequestSchema,
      grantResponseSchema: CertRequestRequestGrantSchema,
      inputsSchema: CertRequestPolicyInputsSchema,
      checkPolicyMatchResponseSchema: BaseCheckPolicyMatchResponseSchema,
      // Certificate approval requests are only ever opened server-side by the issuance flow
      // (certificate-v3-service -> createRequestFromPolicy), atomically with the certificate
      // request row they gate. There is no caller-driven path: a request cannot be opened
      // before its certificate request row exists, and once it exists the row already carries
      // its own approval request. Exposing creation would let a caller pick which policy gates
      // a certificate request they did not create, so it stays off.
      allowRequestCreation: false
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
