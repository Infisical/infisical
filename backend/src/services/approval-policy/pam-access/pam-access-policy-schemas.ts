import picomatch from "picomatch";
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

// Inputs
export const PamAccessPolicyInputsSchema = z.object({
  accountPath: z.string()
});

const accountPathGlob = z.string().refine(
  (el) => {
    try {
      picomatch.parse([el]);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Invalid glob pattern" }
);

// Conditions
export const PamAccessPolicyConditionsSchema = z
  .object({
    accountPaths: accountPathGlob.array()
  })
  .array();

const MutatePamAccessPolicyConditionsSchema = z
  .object({
    accountPaths: accountPathGlob
      .refine((el) => el.startsWith("/"), {
        message: "Path must start with /"
      })
      .refine((el) => !el.endsWith("/"), {
        message: "Path cannot end with /"
      })
      .array()
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
  accountPath: accountPathGlob,
  accessDuration: DurationSchema
});

const CreatePamAccessPolicyRequestDataSchema = z.object({
  accountPath: accountPathGlob
    .refine((el) => el.startsWith("/"), {
      message: "Path must start with /"
    })
    .refine((el) => !el.endsWith("/"), {
      message: "Path cannot end with /"
    }),
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
  conditions: MutatePamAccessPolicyConditionsSchema,
  constraints: PamAccessPolicyConstraintsSchema
});

export const UpdatePamAccessPolicySchema = BaseUpdateApprovalPolicySchema.extend({
  conditions: MutatePamAccessPolicyConditionsSchema.optional(),
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
  requestData: CreatePamAccessPolicyRequestDataSchema
});

// Grants
export const PamAccessRequestGrantSchema = BaseApprovalRequestGrantSchema.extend({
  attributes: PamAccessPolicyRequestDataSchema
});
