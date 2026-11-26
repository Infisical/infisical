import { z } from "zod";

import { ApproverType } from "../approval-policy-enums";
import { BaseApprovalPolicySchema, BaseCreateApprovalPolicySchema } from "../approval-policy-schemas";
import {
  ApprovalStepShortfallKind,
  CERTIFICATE_ACTIONS,
  formatApproverCount,
  getApprovalStepShortfall,
  TCertificateActionPolicyType
} from "./certificate-action-policy-fns";

const ProfileSlugSchema = z.string().trim().min(1).max(255);

// Certificate actions are rare and destructive, so no actor skips their approval. A literal, unlike a refine, shows the
// only accepted value in the API docs.
export const buildNoMachineIdentityBypassSchema = (policyType: TCertificateActionPolicyType) =>
  z.literal(false, {
    errorMap: () => ({
      message: `${CERTIFICATE_ACTIONS[policyType].label} approval policies can't be bypassed by machine identities`
    })
  });

const PolicyStepSchema = BaseCreateApprovalPolicySchema.shape.steps.element;

// These policies have no auto-approval rules and no bypass, so a policy without an approver would hold every request
// it matches with nobody able to approve it.
export const buildCertificateActionStepsSchema = (policyType: TCertificateActionPolicyType) =>
  PolicyStepSchema.extend({
    approvers: PolicyStepSchema.shape.approvers.min(1, "Each approval step needs at least one approver")
  })
    .array()
    .min(1, `A ${CERTIFICATE_ACTIONS[policyType].noun} approval policy needs at least one approval step`)
    .superRefine((steps, ctx) => {
      steps.forEach((step, index) => {
        // A group's members can change after the policy is saved, so a step with a group is counted when a request
        // is raised instead.
        if (step.approvers.some((approver) => approver.type === ApproverType.Group)) return;
        const shortfall = getApprovalStepShortfall({
          requiredApprovals: step.requiredApprovals,
          approverCount: new Set(step.approvers.map((approver) => approver.id)).size
        });
        if (shortfall?.kind !== ApprovalStepShortfallKind.TooFewApprovers) return;
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "requiredApprovals"],
          message: `Step ${index + 1} requires ${shortfall.requiredApprovals} approvals but only has ${formatApproverCount(shortfall.approverCount)}. Add approvers to the step or lower its required approvals.`
        });
      });
    });

export const CertificateActionPolicyInputsSchema = z.object({
  profileName: ProfileSlugSchema,
  applicationId: z.string().uuid()
});

export const CertificateActionPolicyConditionsSchema = z
  .object({
    profileNames: ProfileSlugSchema.array().min(1).max(100)
  })
  .array()
  .min(1)
  .max(50);

export const CertificateActionPolicyConstraintsSchema = z.object({});

export const CertificateActionPolicySchema = BaseApprovalPolicySchema.extend({
  conditions: z.object({
    version: z.literal(1),
    conditions: CertificateActionPolicyConditionsSchema
  }),
  constraints: z.object({
    version: z.literal(1),
    constraints: CertificateActionPolicyConstraintsSchema
  })
});

export const CertificateActionRequestDataSchema = z.object({
  certificateId: z.string().uuid(),
  serialNumber: z.string(),
  commonName: z.string(),
  profileId: z.string().uuid(),
  profileName: z.string(),
  applicationId: z.string().uuid()
});

export const buildApproversCanNoLongerApproveSchema = (policyType: TCertificateActionPolicyType) =>
  z
    .boolean()
    .default(false)
    .describe(
      `Whether too few of the approvers this pending request was raised with can still approve it for it ever to pass. Checked only when requests are listed or one is fetched by ID, and only for a pending request that hasn't expired. Every other request, and every other response, returns false. Once every step of the policy has as many approvers who can approve as it requires, ${CERTIFICATE_ACTIONS[policyType].gerund} the certificate again replaces such a request.`
    );
