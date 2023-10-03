import { z } from "zod";

export const GetSecretApprovalRuleList = z.object({
  query: z.object({
    workspaceId: z.string().trim()
  })
});

export const GetSecretApprovalPolicyOfABoard = z.object({
  query: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim(),
    secretPath: z.string().trim()
  })
});

export const CreateSecretApprovalRule = z.object({
  body: z
    .object({
      workspaceId: z.string(),
      name: z.string().optional(),
      environment: z.string(),
      secretPath: z.string().optional().nullable(),
      approvers: z.string().array().min(1),
      approvals: z.number().min(1).default(1)
    })
    .refine((data) => data.approvals <= data.approvers.length, {
      path: ["approvals"],
      message: "Approvals should be lower than approvals"
    })
});

export const UpdateSecretApprovalRule = z.object({
  params: z.object({
    id: z.string()
  }),
  body: z
    .object({
      name: z.string().optional(),
      approvers: z.string().array().min(1),
      approvals: z.number().min(1).default(1),
      secretPath: z.string().optional().nullable()
    })
    .refine((data) => data.approvals <= data.approvers.length, {
      path: ["approvals"],
      message: "Approvals should be lower than approvals"
    })
});

export const DeleteSecretApprovalRule = z.object({
  params: z.object({
    id: z.string()
  })
});
