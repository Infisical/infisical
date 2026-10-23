import { z } from "zod";

import { BaseApprovalPolicySchema, BaseApprovalRequestSchema } from "../approval-policy-schemas";

export const SecretAccessPolicyConditionsSchema = z.object({});

export const SecretAccessPolicyConstraintsSchema = z.object({
  allowedSelfApprovals: z.boolean(),
  requestExpirationTime: z.string().nullable(),
  maxTimePeriod: z.string().nullable().default(null)
});

export const SecretAccessPolicyRequestDataSchema = z.object({
  permissions: z.unknown(),
  isTemporary: z.boolean(),
  temporaryRange: z.string().nullable()
});

export const SecretAccessPolicyInputsSchema = z.object({
  envId: z.string().uuid(),
  secretPath: z.string(),
  permissions: z.unknown(),
  isTemporary: z.boolean()
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
