import ms from "ms";
import { z } from "zod";

import { ApproverType } from "@app/hooks/api/approvalPolicies";

const DurationSchema = (
  min = 3600,
  max = 2592000,
  msg = "Duration must be between 1 hour and 30 days"
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
  maxRequestTtl: DurationSchema().nullish(),
  conditions: z
    .object({
      profileNames: z.string().array().min(1, "Must have at least one profile")
    })
    .array()
    .min(1, "At least one condition is required"),
  constraints: z.object({}).optional().default({}),
  bypassForMachineIdentities: z.boolean().optional().default(false),
  steps: z
    .object({
      name: z
        .string()
        .max(128)
        .nullable()
        .optional()
        .transform((name) => name || null),
      requiredApprovals: z.number().min(1).max(100),
      notifyApprovers: z.boolean().optional(),
      approvers: z
        .object({
          type: z.nativeEnum(ApproverType),
          id: z.string().uuid()
        })
        .array()
        .min(1, "At least one approver is required")
    })
    .array()
    .min(1, "At least one approval step is required")
});

export type TPolicyForm = z.infer<typeof PolicyFormSchema>;
