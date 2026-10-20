import { z } from "zod";

import { ms } from "@app/lib/ms";

import {
  BaseApprovalPolicySchema,
  BaseApprovalRequestGrantSchema,
  BaseApprovalRequestSchema,
  BaseCheckPolicyMatchResponseSchema,
  BaseCreateApprovalPolicySchema,
  BaseCreateApprovalRequestSchema,
  BaseUpdateApprovalPolicySchema
} from "../approval-policy-schemas";

export const PamAccessTypeSchema = z.enum(["session", "credential"]);

// Inputs
export const PamAccessPolicyInputsSchema = z.object({
  folderId: z.string().uuid().optional(),
  accountId: z.string().uuid(),
  accessType: PamAccessTypeSchema.optional()
});

export const PamAccessPolicyConditionsSchema = z.object({}).array();

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
  accountId: z.string().uuid(),
  folderId: z.string().uuid(),
  reason: z.string().trim().max(1024).optional(),
  duration: DurationSchema,
  accessType: PamAccessTypeSchema.optional()
});

export const PamAccessGrantAttributesSchema = z.object({
  accountId: z.string().uuid(),
  folderId: z.string().uuid().nullable().optional(),
  accessType: PamAccessTypeSchema.optional()
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

// Grants
export const PamAccessRequestGrantSchema = BaseApprovalRequestGrantSchema.extend({
  attributes: PamAccessGrantAttributesSchema
});

// Check Policy Match Response
export const PamAccessCheckPolicyMatchResponseSchema = BaseCheckPolicyMatchResponseSchema.extend({
  constraints: z
    .object({
      accessDuration: z.object({ max: z.string() })
    })
    .optional()
});
