import { z } from "zod";

import {
  ApprovalPoliciesSchema,
  ApprovalRequestApprovalsSchema,
  ApprovalRequestsSchema,
  ApprovalRequestStepsSchema
} from "@app/db/schemas";

import { ApproverType } from "./approval-policy-enums";

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

// Policy
export const BaseApprovalPolicySchema = ApprovalPoliciesSchema.extend({
  steps: ApprovalPolicyStepSchema.array()
});

export const BaseCreateApprovalPolicySchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(128),
  maxRequestTtlSeconds: z.number().min(3600).max(2592000).nullable().optional(), // 1 hour to 30 days
  steps: ApprovalPolicyStepSchema.array()
});

export const BaseUpdateApprovalPolicySchema = z.object({
  name: z.string().min(1).max(128).optional(),
  maxRequestTtlSeconds: z.number().min(3600).max(2592000).nullable().optional(), // 1 hour to 30 days
  steps: ApprovalPolicyStepSchema.array().optional()
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
  steps: ApprovalRequestStepSchema.array()
});

export const BaseCreateApprovalRequestSchema = z.object({
  projectId: z.string().uuid(),
  justification: z.string().max(256).nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional()
});
