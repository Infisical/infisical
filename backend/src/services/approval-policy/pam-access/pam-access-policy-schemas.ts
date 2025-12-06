import { z } from "zod";

import { ms } from "@app/lib/ms";

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
    resourceIds: z.string().uuid().array().optional(),
    accountPaths: z.string().array() // TODO(andrey): Add path & wildcard validation
  })
  .array();

const DurationSchema = z.string().refine(
  (val) => {
    const duration = ms(val) / 1000;

    // 30 seconds to 7 days
    return duration >= 30 && duration <= 604800;
  },
  { message: "Duration must be between 30 seconds and 7 days" }
);

// Constraints
export const PamAccessPolicyConstraintsSchema = z.object({
  accessDuration: z.object({
    min: DurationSchema,
    max: DurationSchema
  })
});

// Request Data
export const PamAccessPolicyRequestDataSchema = z.object({
  resourceId: z.string().uuid(),
  accountPath: z.string(),
  accessDuration: DurationSchema
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
