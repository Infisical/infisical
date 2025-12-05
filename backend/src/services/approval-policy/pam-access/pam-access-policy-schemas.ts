import { z } from "zod";

import {
  BaseApprovalPolicySchema,
  BaseCreateApprovalPolicySchema,
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
    targetResources: z.string().uuid().array(),
    accountPaths: z.string().array() // TODO: Add path & wildcard validation
  })
  .array();

// Constraints
export const PamAccessPolicyConstraintsSchema = z.object({
  requestDurationHours: z.object({
    // 168 hours = 7 days
    min: z.number().min(0).max(168),
    max: z.number().min(1).max(168)
  })
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
