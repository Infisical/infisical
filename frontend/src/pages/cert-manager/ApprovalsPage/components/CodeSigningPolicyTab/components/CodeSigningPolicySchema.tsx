import ms from "ms";
import { z } from "zod";

import { ApprovalStepsSchema } from "@app/components/approvals";
import { CodeSigningApprovalMode } from "@app/hooks/api/approvalPolicies";

export { CodeSigningApprovalMode };

const DurationSchema = (
  min = 60,
  max = 2592000,
  msg = "Duration must be between 1 minute and 30 days"
) =>
  z.string().refine(
    (val) => {
      if (!val || val === "") return true;
      const duration = ms(val) / 1000;
      return duration >= min && duration <= max;
    },
    { message: msg }
  );

export const CodeSigningPolicyFormSchema = z.object({
  name: z.string().min(1, "Policy name is required").max(128),
  maxRequestTtl: DurationSchema(
    86400,
    2592000,
    "Duration must be between 1 day and 30 days"
  ).nullish(),
  constraints: z.object({
    approvalMode: z.nativeEnum(CodeSigningApprovalMode),
    maxWindowDuration: DurationSchema().optional(),
    maxSignings: z.coerce.number().int().positive().optional()
  }),
  bypassForMachineIdentities: z.boolean().optional().default(false),
  steps: ApprovalStepsSchema
});

export type TCodeSigningPolicyForm = z.infer<typeof CodeSigningPolicyFormSchema>;
