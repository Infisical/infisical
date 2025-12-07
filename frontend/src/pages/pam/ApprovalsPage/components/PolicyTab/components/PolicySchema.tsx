import ms from "ms";
import { z } from "zod";

import { ApproverType } from "@app/hooks/api/approvalPolicies";

// 30 to  7 days
const DurationSchema = (
  min = 30,
  max = 604800,
  msg = "Duration must be between 30 seconds and 7 days"
) =>
  z.string().refine(
    (val) => {
      const duration = ms(val) / 1000;

      // 30 seconds to 7 days
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
      accountPaths: z.array(z.string().min(1))
    })
    .array()
    .min(1, "At least one condition is required"),
  constraints: z.object({
    accessDuration: z.object({
      min: DurationSchema(),
      max: DurationSchema()
    })
  }),
  steps: z
    .object({
      name: z.string().max(128).nullable().optional(),
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
