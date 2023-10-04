import { z } from "zod";

export const GetSecretApprovalRuleList = z.object({
  query: z.object({
    workspaceId: z.string()
  })
});

export const CreateSecretApprovalRule = z.object({
  body: z.object({
    workspaceId: z.string(),
    environment: z.string(),
    secretPath: z.string().optional().nullable(),
    approvers: z.string().array().optional(),
    approvals: z.number().min(1).default(1)
  })
});

export const UpdateSecretApprovalRule = z.object({
  params: z.object({
    id: z.string()
  }),
  body: z.object({
    approvers: z.string().array().optional(),
    approvals: z.number().min(1).optional(),
    secretPath: z.string().optional().nullable()
  })
});

export const DeleteSecretApprovalRule = z.object({
  params: z.object({
    id: z.string()
  })
});
