import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const NhiPoliciesSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  isEnabled: z.boolean().default(true),
  conditionRiskFactors: z.unknown().nullable().optional(),
  conditionMinRiskScore: z.number().nullable().optional(),
  conditionIdentityTypes: z.unknown().nullable().optional(),
  conditionProviders: z.unknown().nullable().optional(),
  actionRemediate: z.string().nullable().optional(),
  actionFlag: z.boolean().default(false),
  lastTriggeredAt: z.date().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type TNhiPolicies = z.infer<typeof NhiPoliciesSchema>;
export type TNhiPoliciesInsert = Omit<z.input<typeof NhiPoliciesSchema>, TImmutableDBKeys>;
export type TNhiPoliciesUpdate = Partial<Omit<z.input<typeof NhiPoliciesSchema>, TImmutableDBKeys>>;
