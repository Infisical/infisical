import { z } from "zod";

import { BaseApprovalPolicySchema, BaseApprovalRequestSchema } from "../approval-policy-schemas";

export const SecretAccessPolicyConditionsSchema = z.object({});

export const SecretAccessPolicyConstraintsSchema = z.object({
  allowedSelfApprovals: z.boolean(),
  requestExpirationTime: z.string().nullable(),
  maxTimePeriod: z.string().nullable().default(null)
});

export const SecretAccessPolicyRequestDataSchema = z.object({
  envId: z.string().uuid(),
  envSlug: z.string(),
  secretPath: z.string(),
  permissions: z.unknown(),
  isTemporary: z.boolean(),
  temporaryRange: z.string().nullable()
});

export const SecretAccessPolicyInputsSchema = SecretAccessPolicyRequestDataSchema.pick({
  envId: true,
  secretPath: true,
  permissions: true,
  isTemporary: true
});

export const SecretAccessPolicySchema = BaseApprovalPolicySchema.extend({
  conditions: z.object({
    version: z.literal(1),
    conditions: SecretAccessPolicyConditionsSchema
  }),
  constraints: z.object({
    version: z.literal(1),
    constraints: SecretAccessPolicyConstraintsSchema
  })
});

export const SecretAccessRequestSchema = BaseApprovalRequestSchema.extend({
  requestData: z.object({
    version: z.literal(1),
    requestData: SecretAccessPolicyRequestDataSchema
  })
});
