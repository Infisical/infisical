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
  accountPath: z.string().optional(),
  resourceName: z.string().optional(),
  accountName: z.string().optional()
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
const resourceNameGlob = z.string().refine(
  (el) => {
    try {
      picomatch.parse([el]);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Invalid glob pattern for resource name" }
);

const accountNameGlob = z.string().refine(
  (el) => {
    try {
      picomatch.parse([el]);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Invalid glob pattern for account name" }
);

export const PamAccessPolicyConditionsSchema = z
  .object({
    // Deprecated: use resourceNames and accountNames instead
    accountPaths: accountPathGlob.array().optional(),
    // New fields for matching
    resourceNames: resourceNameGlob.array().optional(),
    accountNames: accountNameGlob.array().optional()
  })
  .array();

const MutatePamAccessPolicyConditionsSchema = z
  .object({
    // Deprecated: use resourceNames and accountNames instead (kept for backwards compatibility)
    accountPaths: accountPathGlob
      .refine((el) => el.startsWith("/"), {
        message: "Path must start with /"
      })
      .refine((el) => !el.endsWith("/"), {
        message: "Path cannot end with /"
      })
      .array()
      .optional(),
    resourceNames: resourceNameGlob.array().optional(),
    accountNames: accountNameGlob.array().optional()
  })
  .refine(
    (data) => {
      // At least one condition type must be provided
      const hasAccountPaths = data.accountPaths && data.accountPaths.length > 0;
      const hasResourceNames = data.resourceNames && data.resourceNames.length > 0;
      const hasAccountNames = data.accountNames && data.accountNames.length > 0;
      return hasAccountPaths || hasResourceNames || hasAccountNames;
    },
    {
      message: "At least one condition type must be provided (resourceNames, accountNames, or accountPaths)"
    }
  )
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

// Request Data - Base schema for stored data (used by grants, etc.)
export const PamAccessPolicyRequestDataSchema = z.object({
  accountPath: accountPathGlob.optional(),
  accessDuration: DurationSchema,
  resourceName: resourceNameGlob.optional(),
  accountName: accountNameGlob.optional()
});

// Schema with validation for creating requests
const CreatePamAccessPolicyRequestDataSchema = z
  .object({
    accountPath: accountPathGlob
      .refine((el) => el.startsWith("/"), {
        message: "Path must start with /"
      })
      .refine((el) => !el.endsWith("/"), {
        message: "Path cannot end with /"
      })
      .optional(),
    accessDuration: DurationSchema,
    resourceName: resourceNameGlob.optional(),
    accountName: accountNameGlob.optional()
  })
  .refine(
    (data) => {
      // At least one identifier must be provided
      const hasAccountPath = Boolean(data.accountPath);
      const hasResourceName = Boolean(data.resourceName);
      const hasAccountName = Boolean(data.accountName);
      return hasAccountPath || hasResourceName || hasAccountName;
    },
    {
      message: "At least one identifier must be provided (accountPath, resourceName, or accountName)"
    }
  );

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
