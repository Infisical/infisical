import { z } from "zod";

import { ApproverType } from "@app/hooks/api/approvalPolicies";

export const ApprovalStepSchema = z.object({
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
});

export const ApprovalStepsSchema = ApprovalStepSchema.array().min(
  1,
  "At least one approval step is required"
);

export type TApprovalStep = z.infer<typeof ApprovalStepSchema>;
export type TApprovalSteps = z.infer<typeof ApprovalStepsSchema>;

export type TFormWithApprovalSteps = {
  steps: TApprovalSteps;
};
