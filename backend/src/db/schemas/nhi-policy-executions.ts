import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const NhiPolicyExecutionsSchema = z.object({
  id: z.string().uuid(),
  policyId: z.string().uuid(),
  identityId: z.string().uuid(),
  scanId: z.string().uuid(),
  projectId: z.string(),
  actionTaken: z.string(),
  remediationActionId: z.string().uuid().nullable().optional(),
  status: z.string(),
  statusMessage: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type TNhiPolicyExecutions = z.infer<typeof NhiPolicyExecutionsSchema>;
export type TNhiPolicyExecutionsInsert = Omit<z.input<typeof NhiPolicyExecutionsSchema>, TImmutableDBKeys>;
export type TNhiPolicyExecutionsUpdate = Partial<Omit<z.input<typeof NhiPolicyExecutionsSchema>, TImmutableDBKeys>>;
