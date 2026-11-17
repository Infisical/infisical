import { z } from "zod";

import { CrlReason } from "@app/services/certificate/certificate-types";

import {
  BaseApprovalPolicySchema,
  BaseApprovalRequestGrantSchema,
  BaseApprovalRequestSchema,
  BaseCreateApprovalPolicySchema,
  BaseUpdateApprovalPolicySchema
} from "../approval-policy-schemas";
import {
  formatApproverCount,
  getRevocationStepShortfall,
  RevocationStepShortfallKind
} from "./cert-revocation-policy-fns";

const ProfileSlugSchema = z.string().trim().min(1).max(255);

// Revocation is rare and destructive, so no actor skips its approval. A literal, unlike a refine, shows the only
// accepted value in the API docs.
const NoMachineIdentityBypassSchema = z.literal(false, {
  errorMap: () => ({ message: "Revocation approval policies can't be bypassed by machine identities" })
});

const PolicyStepSchema = BaseCreateApprovalPolicySchema.shape.steps.element;

// Revocation has no auto-approval rules and no bypass, so a policy without an approver would hold every request it
// matches with nobody able to approve it.
const CertRevocationPolicyStepsSchema = PolicyStepSchema.extend({
  approvers: PolicyStepSchema.shape.approvers.min(1, "Each approval step needs at least one approver")
})
  .array()
  .min(1, "A revocation approval policy needs at least one approval step")
  .superRefine((steps, ctx) => {
    steps.forEach((step, index) => {
      const shortfall = getRevocationStepShortfall(step);
      if (shortfall?.kind !== RevocationStepShortfallKind.TooFewApprovers) return;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, "requiredApprovals"],
        message: `Step ${index + 1} requires ${shortfall.requiredApprovals} approvals but only has ${formatApproverCount(shortfall.approverCount)}. Add approvers to the step or lower its required approvals.`
      });
    });
  });

export const CertRevocationPolicyInputsSchema = z.object({
  profileName: ProfileSlugSchema,
  applicationId: z.string().uuid()
});

export const CertRevocationPolicyConditionsSchema = z
  .object({
    profileNames: ProfileSlugSchema.array().min(1).max(100)
  })
  .array()
  .min(1)
  .max(50);

export const CertRevocationPolicyConstraintsSchema = z.object({});

export const CertRevocationPolicyRequestDataSchema = z.object({
  certificateId: z.string().uuid(),
  serialNumber: z.string(),
  commonName: z.string(),
  profileId: z.string().uuid(),
  profileName: z.string(),
  applicationId: z.string().uuid(),
  revocationReason: z.nativeEnum(CrlReason)
});

export const CertRevocationPolicySchema = BaseApprovalPolicySchema.extend({
  conditions: z.object({
    version: z.literal(1),
    conditions: CertRevocationPolicyConditionsSchema
  }),
  constraints: z.object({
    version: z.literal(1),
    constraints: CertRevocationPolicyConstraintsSchema
  })
});

export const CreateCertRevocationPolicySchema = BaseCreateApprovalPolicySchema.extend({
  conditions: CertRevocationPolicyConditionsSchema,
  steps: CertRevocationPolicyStepsSchema,
  constraints: CertRevocationPolicyConstraintsSchema.optional().default({}),
  bypassForMachineIdentities: NoMachineIdentityBypassSchema.optional().default(false)
});

export const UpdateCertRevocationPolicySchema = BaseUpdateApprovalPolicySchema.extend({
  conditions: CertRevocationPolicyConditionsSchema.optional(),
  steps: CertRevocationPolicyStepsSchema.optional(),
  constraints: CertRevocationPolicyConstraintsSchema.optional(),
  bypassForMachineIdentities: NoMachineIdentityBypassSchema.optional()
});

export const CertRevocationRequestSchema = BaseApprovalRequestSchema.extend({
  requestData: z.object({
    version: z.literal(1),
    requestData: CertRevocationPolicyRequestDataSchema
  })
});

export const CertRevocationRequestGrantSchema = BaseApprovalRequestGrantSchema.extend({
  attributes: CertRevocationPolicyRequestDataSchema
});
