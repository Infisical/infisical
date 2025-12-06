import { z } from "zod";

import {
  BaseApprovalPolicySchema,
  BaseApprovalRequestSchema,
  BaseCreateApprovalPolicySchema,
  BaseCreateApprovalRequestSchema,
  BaseUpdateApprovalPolicySchema
} from "../approval-policy-schemas";

// Inputs
export const PamAccessPolicyInputsSchema = z.object({
  resourceId: z.string().uuid(),
  accountPath: z.string()
});

// Conditions
export const PamAccessPolicyConditionsSchema = z
  .object({
    resourceIds: z.string().uuid().array(),
    accountPaths: z.string().array() // TODO(andrey): Add path & wildcard validation
  })
  .array();

// Constraints
export const PamAccessPolicyConstraintsSchema = z.object({
  requestDurationSeconds: z.object({
    min: z.number().min(30).max(604800),
    max: z.number().min(30).max(604800) // 30 seconds to 7 days
  })
});

// Request Data
export const PamAccessPolicyRequestDataSchema = z.object({
  resourceId: z.string().uuid(),
  accountPath: z.string(),
  requestDurationSeconds: z.number().min(30).max(604800) // 30 seconds to 7 days
});

// Policy
export const PamAccessPolicySchema = BaseApprovalPolicySchema.extend({
  conditions: z.object({
    version: z.literal(1),
    conditions: PamAccessPolicyConditionsSchema
  }),
  constraints: z.object({
    version: z.literal(1),
    constraints: PamAccessPolicyConstraintsSchema
  })
});

export const CreatePamAccessPolicySchema = BaseCreateApprovalPolicySchema.extend({
  conditions: PamAccessPolicyConditionsSchema,
  constraints: PamAccessPolicyConstraintsSchema
});

export const UpdatePamAccessPolicySchema = BaseUpdateApprovalPolicySchema.extend({
  conditions: PamAccessPolicyConditionsSchema.optional(),
  constraints: PamAccessPolicyConstraintsSchema.optional()
});

// Request
export const PamAccessRequestSchema = BaseApprovalRequestSchema.extend({
  requestData: z.object({
    version: z.literal(1),
    requestData: PamAccessPolicyRequestDataSchema
  })
});

export const CreatePamAccessRequestSchema = BaseCreateApprovalRequestSchema.extend({
  requestData: PamAccessPolicyRequestDataSchema
});
