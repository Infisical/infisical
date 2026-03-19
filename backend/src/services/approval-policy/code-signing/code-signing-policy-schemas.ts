import { z } from "zod";

import { ms } from "@app/lib/ms";

import {
  BaseApprovalPolicySchema,
  BaseApprovalRequestGrantSchema,
  BaseApprovalRequestSchema,
  BaseCreateApprovalPolicySchema,
  BaseCreateApprovalRequestSchema,
  BaseUpdateApprovalPolicySchema
} from "../approval-policy-schemas";

export const CodeSigningPolicyInputsSchema = z.object({
  signerId: z.string().uuid(),
  approvalPolicyId: z.string().uuid()
});

export const CodeSigningPolicyConditionsSchema = z.object({}).array();

const WindowDurationSchema = z
  .string()
  .refine(
    (val) => {
      const duration = ms(val) / 1000;
      // 1 minute to 30 days
      return duration >= 60 && duration <= 2592000;
    },
    { message: "Window duration must be between 1 minute and 30 days" }
  )
  .optional();

export const CodeSigningPolicyConstraintsSchema = z
  .object({
    maxWindowDuration: WindowDurationSchema,
    maxSignings: z.number().int().positive().optional()
  })
  .refine((data) => data.maxWindowDuration || data.maxSignings, {
    message: "At least one constraint (maxWindowDuration or maxSignings) is required"
  });

export const CodeSigningPolicyRequestDataSchema = z.object({
  signerId: z.string().uuid(),
  approvalPolicyId: z.string().uuid(),
  signerName: z.string(),
  justification: z.string().max(512).optional(),
  requestedWindowStart: z.string().datetime().optional(),
  requestedWindowEnd: z.string().datetime().optional(),
  requestedSignings: z.number().int().positive().optional()
});

export const CodeSigningPolicySchema = BaseApprovalPolicySchema.extend({
  conditions: z.object({
    version: z.literal(1),
    conditions: CodeSigningPolicyConditionsSchema
  }),
  constraints: z.object({
    version: z.literal(1),
    constraints: CodeSigningPolicyConstraintsSchema
  })
});

export const CreateCodeSigningPolicySchema = BaseCreateApprovalPolicySchema.extend({
  conditions: CodeSigningPolicyConditionsSchema.default([]),
  constraints: CodeSigningPolicyConstraintsSchema
});

export const UpdateCodeSigningPolicySchema = BaseUpdateApprovalPolicySchema.extend({
  conditions: CodeSigningPolicyConditionsSchema.optional(),
  constraints: CodeSigningPolicyConstraintsSchema.optional()
});

export const CodeSigningRequestSchema = BaseApprovalRequestSchema.extend({
  requestData: z.object({
    version: z.literal(1),
    requestData: CodeSigningPolicyRequestDataSchema
  })
});

export const CreateCodeSigningRequestSchema = BaseCreateApprovalRequestSchema.extend({
  requestData: CodeSigningPolicyRequestDataSchema
});

export const CodeSigningRequestGrantSchema = BaseApprovalRequestGrantSchema.extend({
  attributes: z.object({
    signerId: z.string().uuid(),
    signerName: z.string(),
    maxSignings: z.number().int().positive().optional(),
    windowStart: z.string().datetime().optional()
  })
});
