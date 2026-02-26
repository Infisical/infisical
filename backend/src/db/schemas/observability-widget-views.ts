import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const ObservabilityWidgetViewsSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
  items: z.unknown(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type TObservabilityWidgetViews = z.infer<typeof ObservabilityWidgetViewsSchema>;
export type TObservabilityWidgetViewsInsert = Omit<z.input<typeof ObservabilityWidgetViewsSchema>, TImmutableDBKeys>;
export type TObservabilityWidgetViewsUpdate = Partial<Omit<z.input<typeof ObservabilityWidgetViewsSchema>, TImmutableDBKeys>>;
