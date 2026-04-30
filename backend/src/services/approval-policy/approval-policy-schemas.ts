import { z } from "zod";

import {
  ApprovalPoliciesSchema,
  ApprovalRequestApprovalsSchema,
  ApprovalRequestGrantsSchema,
  ApprovalRequestsSchema,
  ApprovalRequestStepsSchema
} from "@app/db/schemas";
import { ms } from "@app/lib/ms";

import { ApproverType, EnforcementLevel } from "./approval-policy-enums";

const ApprovalPolicyStepSchema = z.object({
  name: z.string().min(1).max(128).nullable().optional(),
  requiredApprovals: z.number().min(1).max(100),
  notifyApprovers: z.boolean().nullable().optional(),
  approvers: z
    .object({
      type: z.nativeEnum(ApproverType),
      id: z.string().uuid()
    })
    .array()
});

const BypasserSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(ApproverType.User), id: z.string().uuid() }),
  z.object({ type: z.literal(ApproverType.Group), id: z.string().uuid() })
]);

const MaxRequestTtlSchema = z.string().refine(
  (val) => {
    const duration = ms(val) / 1000;

    // 1 hour to 30 days
    return duration >= 3600 && duration <= 2592000;
  },
  { message: "Duration must be between 1 hour and 30 days" }
);

// Policy
export const BaseApprovalPolicySchema = ApprovalPoliciesSchema.extend({
  steps: ApprovalPolicyStepSchema.array(),
  enforcementLevel: z.nativeEnum(EnforcementLevel).default(EnforcementLevel.Hard),
  bypassers: BypasserSchema.array().default([])
});

export const BaseCreateApprovalPolicySchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(128),
  maxRequestTtl: MaxRequestTtlSchema.nullable().optional(),
  steps: ApprovalPolicyStepSchema.array(),
  bypassForMachineIdentities: z.boolean().optional().default(false),
  enforcementLevel: z.nativeEnum(EnforcementLevel).optional().default(EnforcementLevel.Hard),
  bypassers: BypasserSchema.array().max(100).optional().default([])
});

export const BaseUpdateApprovalPolicySchema = z.object({
  name: z.string().min(1).max(128).optional(),
  maxRequestTtl: MaxRequestTtlSchema.nullable().optional(),
  steps: ApprovalPolicyStepSchema.array().optional(),
  bypassForMachineIdentities: z.boolean().optional(),
  enforcementLevel: z.nativeEnum(EnforcementLevel).optional(),
  bypassers: BypasserSchema.array().max(100).optional()
});

// Request
const ApprovalRequestStepSchema = ApprovalRequestStepsSchema.extend({
  name: z.string().min(1).max(128).nullable().optional(),
  requiredApprovals: z.number().min(1).max(100),
  notifyApprovers: z.boolean().nullable().optional(),
  stepNumber: z.number(),
  status: z.string(),
  startedAt: z.date().nullable().optional(),
  completedAt: z.date().nullable().optional(),
  approvers: z
    .object({
      type: z.nativeEnum(ApproverType),
      id: z.string().uuid()
    })
    .array(),
  approvals: ApprovalRequestApprovalsSchema.array()
});

export const BaseApprovalRequestSchema = ApprovalRequestsSchema.extend({
  steps: ApprovalRequestStepSchema.array(),
  canBreakGlass: z.boolean().default(false),
  bypassReasonRequired: z.boolean().default(false),
  isBreakGlass: z.boolean().default(false),
  bypassReason: z.string().nullable().optional()
});

export const BaseCreateApprovalRequestSchema = z.object({
  projectId: z.string().uuid(),
  justification: z.string().max(256).nullable().optional(),
  requestDuration: z
    .string()
    .refine(
      (val) => {
        const duration = ms(val) / 1000;

        // 1 minute to 30 days
        return duration >= 60 && duration <= 2592000;
      },
      { message: "Duration must be between 1 minute and 30 days" }
    )
    .nullable()
    .optional()
});

// Grants
export const BaseApprovalRequestGrantSchema = ApprovalRequestGrantsSchema;
