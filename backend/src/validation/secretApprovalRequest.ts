import { z } from "zod";
import { ApprovalStatus } from "../models/secretApprovalRequest";

export const getSecretApprovalRequests = z.object({
  query: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim().optional(),
    committer: z.string().trim().optional(),
    status: z.enum(["open", "close"]).optional(),
    limit: z.coerce.number().default(20),
    offset: z.coerce.number().default(0)
  })
});

export const getSecretApprovalRequestDetails = z.object({
  params: z.object({
    id: z.string().trim()
  })
});

export const updateSecretApprovalRequestStatus = z.object({
  body: z.object({
    status: z.enum([ApprovalStatus.APPROVED, ApprovalStatus.REJECTED])
  }),
  params: z.object({
    id: z.string().trim()
  })
});

export const mergeSecretApprovalRequest = z.object({
  body: z.object({
    id: z.string().trim()
  })
});
