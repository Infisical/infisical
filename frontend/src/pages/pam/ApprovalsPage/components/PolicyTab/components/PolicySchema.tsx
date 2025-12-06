import { ApproverType } from "@app/hooks/api/approvalPolicies";
import { z } from "zod";

export const PolicyFormSchema = z.object({
  name: z.string().min(1, "Policy name is required").max(128),
  maxRequestTtlSeconds: z.number().min(3600).max(2592000).nullable().optional(),
  conditions: z
    .object({
      resourceIds: z.array(z.string().uuid()),
      accountPaths: z.array(z.string().min(1))
    })
    .array()
    .min(1, "At least one condition is required"),
  constraints: z.object({
    requestDurationHours: z.object({
      min: z.number().min(0).max(168),
      max: z.number().min(1).max(168)
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
