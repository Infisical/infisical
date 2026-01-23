import ms from "ms";
import { z } from "zod";

import { ApprovalStepsSchema } from "@app/components/approvals";

const DurationSchema = (
  min = 86400,
  max = 2592000,
  msg = "Duration must be between 1 day and 30 days"
) =>
  z.string().refine(
    (val) => {
      if (!val || val === "") return true;
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
  steps: ApprovalStepsSchema
});

export type TPolicyForm = z.infer<typeof PolicyFormSchema>;
