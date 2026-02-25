import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const ObservabilityWidgetsSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  orgId: z.string().uuid(),
  subOrgId: z.string().uuid().nullable().optional(),
  projectId: z.string().nullable().optional(),
  type: z.string(),
  config: z.unknown(),
  refreshInterval: z.number().default(30),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type TObservabilityWidgets = z.infer<typeof ObservabilityWidgetsSchema>;
export type TObservabilityWidgetsInsert = Omit<z.input<typeof ObservabilityWidgetsSchema>, TImmutableDBKeys>;
export type TObservabilityWidgetsUpdate = Partial<Omit<z.input<typeof ObservabilityWidgetsSchema>, TImmutableDBKeys>>;
