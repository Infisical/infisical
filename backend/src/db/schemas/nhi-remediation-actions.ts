import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const NhiRemediationActionsSchema = z.object({
  id: z.string().uuid(),
  identityId: z.string().uuid(),
  projectId: z.string(),
  sourceId: z.string().uuid(),
  actionType: z.string(),
  status: z.string().default("pending"),
  statusMessage: z.string().nullable().optional(),
  triggeredBy: z.string(),
  riskFactor: z.string().nullable().optional(),
  metadata: z.unknown().default("{}"),
  completedAt: z.date().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type TNhiRemediationActions = z.infer<typeof NhiRemediationActionsSchema>;
export type TNhiRemediationActionsInsert = Omit<z.input<typeof NhiRemediationActionsSchema>, TImmutableDBKeys>;
export type TNhiRemediationActionsUpdate = Partial<Omit<z.input<typeof NhiRemediationActionsSchema>, TImmutableDBKeys>>;
