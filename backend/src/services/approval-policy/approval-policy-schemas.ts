import { z } from "zod";

import { ApprovalPoliciesSchema } from "@app/db/schemas";

import { ApproverType } from "./approval-policy-enums";

export const BaseApprovalPolicySchema = ApprovalPoliciesSchema;

export const BaseCreateApprovalPolicySchema = z.object({
  projectId: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(128),
  maxRequestTtlSeconds: z.number().min(3600).max(2592000).nullable().optional(), // 1 hour to 30 days
  steps: z
    .object({
      name: z.string().min(1).max(128).nullable().optional(),
      requiredApprovals: z.number().min(1).max(100),
      notifyApprovers: z.boolean().optional(),
      approvers: z
        .object({
          type: z.nativeEnum(ApproverType),
          id: z.string().uuid()
        })
        .array()
    })
    .array()
});

export const BaseUpdateApprovalPolicySchema = z.object({
  name: z.string().min(1).max(128).optional(),
  maxRequestTtlSeconds: z.number().min(3600).max(2592000).nullable().optional(), // 1 hour to 30 days
  steps: z
    .object({
      name: z.string().min(1).max(128).nullable().optional(),
      requiredApprovals: z.number().min(1).max(100),
      notifyApprovers: z.boolean().optional(),
      approvers: z
        .object({
          type: z.nativeEnum(ApproverType),
          id: z.string().uuid()
        })
        .array()
    })
    .array()
    .optional()
});
