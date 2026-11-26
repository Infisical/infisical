import { z } from "zod";

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

const NoMachineIdentityBypassSchema = buildNoMachineIdentityBypassSchema(ApprovalPolicyType.CertDeletion);

const CertDeletionPolicyStepsSchema = buildCertificateActionStepsSchema(ApprovalPolicyType.CertDeletion);

// Taken when the deletion is requested, so the audit log and notifications can still name the certificate once it's
// deleted.
export const CertDeletionPolicyRequestDataSchema = CertificateActionRequestDataSchema.extend({
  friendlyName: z.string().nullable().optional(),
  altNames: z.string().nullable().optional()
});

export const CreateCertDeletionPolicySchema = BaseCreateApprovalPolicySchema.extend({
  conditions: CertificateActionPolicyConditionsSchema,
  steps: CertDeletionPolicyStepsSchema,
  constraints: CertificateActionPolicyConstraintsSchema.optional().default({}),
  bypassForMachineIdentities: NoMachineIdentityBypassSchema.optional().default(false)
});

export const UpdateCertDeletionPolicySchema = BaseUpdateApprovalPolicySchema.extend({
  conditions: CertificateActionPolicyConditionsSchema.optional(),
  steps: CertDeletionPolicyStepsSchema.optional(),
  constraints: CertificateActionPolicyConstraintsSchema.optional(),
  bypassForMachineIdentities: NoMachineIdentityBypassSchema.optional()
});

export const CertDeletionRequestSchema = BaseApprovalRequestSchema.extend({
  requestData: z.object({
    version: z.literal(1),
    requestData: CertDeletionPolicyRequestDataSchema
  }),
  approversCanNoLongerApprove: buildApproversCanNoLongerApproveSchema(ApprovalPolicyType.CertDeletion)
});

export const CertDeletionRequestGrantSchema = BaseApprovalRequestGrantSchema.extend({
  attributes: CertDeletionPolicyRequestDataSchema
});
