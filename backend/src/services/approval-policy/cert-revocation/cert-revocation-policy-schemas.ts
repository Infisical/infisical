import { z } from "zod";

import { CrlReason } from "@app/services/certificate/certificate-types";

import { ApprovalPolicyType } from "../approval-policy-enums";
import {
  BaseApprovalRequestGrantSchema,
  BaseApprovalRequestSchema,
  BaseCreateApprovalPolicySchema,
  BaseUpdateApprovalPolicySchema
} from "../approval-policy-schemas";
import {
  buildApproversCanNoLongerApproveSchema,
  buildCertificateActionStepsSchema,
  buildNoMachineIdentityBypassSchema,
  CertificateActionPolicyConditionsSchema,
  CertificateActionPolicyConstraintsSchema,
  CertificateActionRequestDataSchema
} from "../pki-approvers/certificate-action-policy-schemas";

const NoMachineIdentityBypassSchema = buildNoMachineIdentityBypassSchema(ApprovalPolicyType.CertRevocation);

const CertRevocationPolicyStepsSchema = buildCertificateActionStepsSchema(ApprovalPolicyType.CertRevocation);

export const CertRevocationPolicyRequestDataSchema = CertificateActionRequestDataSchema.extend({
  revocationReason: z.nativeEnum(CrlReason)
});

export const CreateCertRevocationPolicySchema = BaseCreateApprovalPolicySchema.extend({
  conditions: CertificateActionPolicyConditionsSchema,
  steps: CertRevocationPolicyStepsSchema,
  constraints: CertificateActionPolicyConstraintsSchema.optional().default({}),
  bypassForMachineIdentities: NoMachineIdentityBypassSchema.optional().default(false)
});

export const UpdateCertRevocationPolicySchema = BaseUpdateApprovalPolicySchema.extend({
  conditions: CertificateActionPolicyConditionsSchema.optional(),
  steps: CertRevocationPolicyStepsSchema.optional(),
  constraints: CertificateActionPolicyConstraintsSchema.optional(),
  bypassForMachineIdentities: NoMachineIdentityBypassSchema.optional()
});

export const CertRevocationRequestSchema = BaseApprovalRequestSchema.extend({
  requestData: z.object({
    version: z.literal(1),
    requestData: CertRevocationPolicyRequestDataSchema
  }),
  approversCanNoLongerApprove: buildApproversCanNoLongerApproveSchema(ApprovalPolicyType.CertRevocation)
});

export const CertRevocationRequestGrantSchema = BaseApprovalRequestGrantSchema.extend({
  attributes: CertRevocationPolicyRequestDataSchema
});
