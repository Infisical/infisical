import ms from "ms";
import { z } from "zod";

import { ApproverType, BypasserType } from "@app/hooks/api/accessApproval/types";
import { EnforcementLevel, PolicyType } from "@app/hooks/api/policies/enums";

import { getEmptyApprovalStepIndexes } from "./approvalPolicyFormUtils";

const MIN_EXPIRATION_MS = 60 * 1000;
const MAX_EXPIRATION_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_POLICY_SUBJECTS = 100;
const memberEmailSchema = z.string().trim().email().max(255);

export const isValidMemberEmail = (value: string) => memberEmailSchema.safeParse(value).success;

const userApproverSchema = z
  .object({
    type: z.literal(ApproverType.User),
    id: z.string().optional(),
    username: memberEmailSchema.optional(),
    name: z.string().optional(),
    isOrgMembershipActive: z.boolean().optional()
  })
  .refine(({ id, username }) => Boolean(id || username), {
    message: "Select a member or enter their exact email address"
  });

const userBypasserSchema = z
  .object({
    type: z.literal(BypasserType.User),
    id: z.string().optional(),
    username: memberEmailSchema.optional(),
    name: z.string().optional(),
    isOrgMembershipActive: z.boolean().optional()
  })
  .refine(({ id, username }) => Boolean(id || username), {
    message: "Select a member or enter their exact email address"
  });

const durationSchema = z
  .string()
  .trim()
  .nullish()
  .superRefine((val, ctx) => {
    if (!val || val === "never") return;
    const parsed = ms(val);

    if (typeof parsed !== "number" || parsed <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid duration format. Use formats like '1h', '3d', '72h'."
      });
      return;
    }

    if (parsed < MIN_EXPIRATION_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duration must be at least 1 minute."
      });
      return;
    }

    if (parsed > MAX_EXPIRATION_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duration cannot exceed 1 year."
      });
    }
  });

export const approvalPolicyFormSchema = z
  .object({
    environments: z.array(z.object({ slug: z.string(), name: z.string() })).min(1),
    name: z.string().optional(),
    secretPath: z.string().trim().min(1),
    approvals: z.number().min(1).default(1),
    userApprovers: userApproverSchema.array().default([]),
    groupApprovers: z
      .object({ type: z.literal(ApproverType.Group), id: z.string(), name: z.string().optional() })
      .array()
      .default([]),
    userBypassers: userBypasserSchema.array().default([]),
    groupBypassers: z
      .object({ type: z.literal(BypasserType.Group), id: z.string(), name: z.string().optional() })
      .array()
      .default([]),
    policyType: z.nativeEnum(PolicyType),
    enforcementLevel: z.nativeEnum(EnforcementLevel).default(EnforcementLevel.Hard),
    allowedSelfApprovals: z.boolean().default(true),
    bypassForMachineIdentities: z.boolean().optional().default(false),
    sequenceApprovers: z
      .object({
        user: userApproverSchema.array().default([]),
        group: z
          .object({
            type: z.literal(ApproverType.Group),
            id: z.string(),
            name: z.string().optional()
          })
          .array()
          .default([]),
        approvals: z.number().min(1).default(1)
      })
      .array()
      .default([])
      .optional(),
    maxTimePeriod: durationSchema,
    requestExpirationTime: durationSchema
  })
  .superRefine((data, ctx) => {
    const bypasserCount = data.userBypassers.length + data.groupBypassers.length;
    if (bypasserCount > MAX_POLICY_SUBJECTS) {
      ctx.addIssue({
        path: ["userBypassers"],
        code: z.ZodIssueCode.custom,
        message: `Cannot have more than ${MAX_POLICY_SUBJECTS} bypassers`
      });
    }

    data.userBypassers.forEach((bypasser, index) => {
      if (bypasser.isOrgMembershipActive === false) {
        ctx.addIssue({
          path: ["userBypassers", index],
          code: z.ZodIssueCode.custom,
          message: "Inactive users cannot bypass approval policies"
        });
      }
    });

    if (data.policyType === PolicyType.ChangePolicy) {
      const approverCount = data.userApprovers.length + data.groupApprovers.length;

      if (!(data.groupApprovers.length || data.userApprovers.length)) {
        ctx.addIssue({
          path: ["userApprovers"],
          code: z.ZodIssueCode.custom,
          message: "At least one approver should be provided"
        });
        ctx.addIssue({
          path: ["groupApprovers"],
          code: z.ZodIssueCode.custom,
          message: "At least one approver should be provided"
        });
      }

      if (approverCount > MAX_POLICY_SUBJECTS) {
        ctx.addIssue({
          path: ["userApprovers"],
          code: z.ZodIssueCode.custom,
          message: `Cannot have more than ${MAX_POLICY_SUBJECTS} approvers`
        });
      }

      if (!data.groupApprovers.length && data.approvals > data.userApprovers.length) {
        ctx.addIssue({
          path: ["approvals"],
          code: z.ZodIssueCode.custom,
          message: "Minimum approvals cannot be greater than the number of approvers"
        });
      }

      data.userApprovers.forEach((approver, index) => {
        if (approver.isOrgMembershipActive === false) {
          ctx.addIssue({
            path: ["userApprovers", index],
            code: z.ZodIssueCode.custom,
            message: "Inactive users cannot approve policies"
          });
        }
      });
      return;
    }

    const approvalSteps = data.sequenceApprovers ?? [];
    const approverCount = approvalSteps.reduce(
      (count, step) => count + step.user.length + step.group.length,
      0
    );

    if (approverCount > MAX_POLICY_SUBJECTS) {
      ctx.addIssue({
        path: ["sequenceApprovers"],
        code: z.ZodIssueCode.custom,
        message: `Cannot have more than ${MAX_POLICY_SUBJECTS} approvers`
      });
    }

    if (!approvalSteps.length) {
      ctx.addIssue({
        path: ["sequenceApprovers"],
        code: z.ZodIssueCode.custom,
        message: "At least one approval step should be provided"
      });
    }

    getEmptyApprovalStepIndexes(approvalSteps).forEach((index) => {
      ctx.addIssue({
        path: ["sequenceApprovers", index, "user"],
        code: z.ZodIssueCode.custom,
        message: "Select at least one approver for this step"
      });
    });

    approvalSteps.forEach((step, stepIndex) => {
      if (!step.group.length && step.approvals > step.user.length) {
        ctx.addIssue({
          path: ["sequenceApprovers", stepIndex, "approvals"],
          code: z.ZodIssueCode.custom,
          message: "Minimum approvals cannot be greater than the number of approvers"
        });
      }

      step.user.forEach((approver, approverIndex) => {
        if (approver.isOrgMembershipActive === false) {
          ctx.addIssue({
            path: ["sequenceApprovers", stepIndex, "user", approverIndex],
            code: z.ZodIssueCode.custom,
            message: "Inactive users cannot approve policies"
          });
        }
      });
    });
  });

export type TApprovalPolicyFormSchema = z.infer<typeof approvalPolicyFormSchema>;
