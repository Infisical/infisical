import { z } from "zod";

import {
  BaseApprovalPolicySchema,
  BaseApprovalRequestGrantSchema,
  BaseApprovalRequestSchema,
  BaseCreateApprovalPolicySchema,
  BaseUpdateApprovalPolicySchema
} from "../approval-policy-schemas";
import {
  buildApplicationApprovalStepsSchema,
  buildNoMachineIdentityBypassSchema,
  ProfileSlugSchema
} from "../cert-revocation/cert-revocation-policy-schemas";

const NoMachineIdentityBypassSchema = buildNoMachineIdentityBypassSchema("Deletion");

const CertDeletionPolicyStepsSchema = buildApplicationApprovalStepsSchema("deletion");

export const CertDeletionPolicyInputsSchema = z.object({
  profileName: ProfileSlugSchema,
  applicationId: z.string().uuid()
});

export const CertDeletionPolicyConditionsSchema = z
  .object({
    profileNames: ProfileSlugSchema.array().min(1).max(100)
  })
  .array()
  .min(1)
  .max(50);

export const CertDeletionPolicyConstraintsSchema = z.object({});

// Taken when the deletion is requested, so the audit log and notifications can still name the certificate once it's
// deleted.
export const CertDeletionPolicyRequestDataSchema = z.object({
  certificateId: z.string().uuid(),
  serialNumber: z.string(),
  commonName: z.string(),
  friendlyName: z.string().nullable().optional(),
  altNames: z.string().nullable().optional(),
  profileId: z.string().uuid(),
  profileName: z.string(),
  applicationId: z.string().uuid()
});

export const CertDeletionPolicySchema = BaseApprovalPolicySchema.extend({
  conditions: z.object({
    version: z.literal(1),
    conditions: CertDeletionPolicyConditionsSchema
  }),
  constraints: z.object({
    version: z.literal(1),
    constraints: CertDeletionPolicyConstraintsSchema
  })
});

export const CreateCertDeletionPolicySchema = BaseCreateApprovalPolicySchema.extend({
  conditions: CertDeletionPolicyConditionsSchema,
  steps: CertDeletionPolicyStepsSchema,
  constraints: CertDeletionPolicyConstraintsSchema.optional().default({}),
  bypassForMachineIdentities: NoMachineIdentityBypassSchema.optional().default(false)
});

export const UpdateCertDeletionPolicySchema = BaseUpdateApprovalPolicySchema.extend({
  conditions: CertDeletionPolicyConditionsSchema.optional(),
  steps: CertDeletionPolicyStepsSchema.optional(),
  constraints: CertDeletionPolicyConstraintsSchema.optional(),
  bypassForMachineIdentities: NoMachineIdentityBypassSchema.optional()
});

export const CertDeletionRequestSchema = BaseApprovalRequestSchema.extend({
  requestData: z.object({
    version: z.literal(1),
    requestData: CertDeletionPolicyRequestDataSchema
  }),
  approversCanNoLongerApprove: z
    .boolean()
    .default(false)
    .describe(
      "Whether too few of the approvers this pending request was raised with can still approve it for it ever to pass. Set when requests are listed or one is fetched by ID. Once the policy has approvers who can approve, deleting the certificate again replaces such a request."
    )
});

export const CertDeletionRequestGrantSchema = BaseApprovalRequestGrantSchema.extend({
  attributes: CertDeletionPolicyRequestDataSchema
});
