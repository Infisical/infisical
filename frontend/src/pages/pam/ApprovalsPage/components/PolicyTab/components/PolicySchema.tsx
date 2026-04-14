import ms from "ms";
import { z } from "zod";

import { ApprovalStepsSchema } from "@app/components/approvals";

const DurationSchema = (
  min = 30,
  max = 604800,
  msg = "Duration must be between 30 seconds and 7 days"
) =>
  z.string().refine(
    (val) => {
      const duration = ms(val) / 1000;
      return duration >= min && duration <= max;
    },
    { message: msg }
  );

export const PolicyFormSchema = z.object({
  name: z.string().min(1, "Policy name is required").max(128),
  maxRequestTtl: DurationSchema(
    3600,
    2592000,
    "Duration must be between 1 hour and 30 days"
  ).nullish(),
  conditions: z
    .object({
      resourceNames: z.string().array().optional(),
      accountNames: z.string().array().optional()
    })
    .superRefine((data, ctx) => {
      // At least one condition type must be provided
      const hasResourceNames = data.resourceNames && data.resourceNames.length > 0;
      const hasAccountNames = data.accountNames && data.accountNames.length > 0;
      if (!hasResourceNames && !hasAccountNames) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "At least one condition type must be provided (Resource Names or Account Names)",
          path: ["resourceNames"]
        });
      }
    })
    .array()
    .min(1, "At least one condition is required"),
  constraints: z.object({
    accessDuration: z.object({
      min: DurationSchema(),
      max: DurationSchema()
    })
  }),
  steps: ApprovalStepsSchema
});

export type TPolicyForm = z.infer<typeof PolicyFormSchema>;
