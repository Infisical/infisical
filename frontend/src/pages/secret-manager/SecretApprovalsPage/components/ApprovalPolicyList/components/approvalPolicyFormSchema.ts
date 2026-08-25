import ms from "ms";
import { z } from "zod";

import { ApproverType, BypasserType } from "@app/hooks/api/accessApproval/types";
import { EnforcementLevel, PolicyType } from "@app/hooks/api/policies/enums";

import { getEmptyApprovalStepIndexes } from "./approvalPolicyFormUtils";

const MIN_EXPIRATION_MS = 60 * 1000;
const MAX_EXPIRATION_MS = 365 * 24 * 60 * 60 * 1000;

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
    userApprovers: z
      .object({
        type: z.literal(ApproverType.User),
        id: z.string(),
        name: z.string().optional(),
        isOrgMembershipActive: z.boolean().optional()
      })
      .array()
      .default([]),
    groupApprovers: z
      .object({ type: z.literal(ApproverType.Group), id: z.string() })
      .array()
      .default([]),
    userBypassers: z
      .object({
        type: z.literal(BypasserType.User),
        id: z.string(),
        isOrgMembershipActive: z.boolean().optional()
      })
      .array()
      .default([]),
    groupBypassers: z
      .object({ type: z.literal(BypasserType.Group), id: z.string() })
      .array()
      .default([]),
    policyType: z.nativeEnum(PolicyType),
    enforcementLevel: z.nativeEnum(EnforcementLevel).default(EnforcementLevel.Hard),
    allowedSelfApprovals: z.boolean().default(true),
    bypassForMachineIdentities: z.boolean().optional().default(false),
    sequenceApprovers: z
      .object({
        user: z
          .object({
            type: z.literal(ApproverType.User),
            id: z.string(),
            name: z.string().optional(),
            isOrgMembershipActive: z.boolean().optional()
          })
          .array()
          .default([]),
        group: z
          .object({ type: z.literal(ApproverType.Group), id: z.string() })
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
    if (data.policyType === PolicyType.ChangePolicy) {
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
      return;
    }

    const approvalSteps = data.sequenceApprovers ?? [];

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
  });

export type TApprovalPolicyFormSchema = z.infer<typeof approvalPolicyFormSchema>;
