import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const TokenSessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  ip: z.string(),
  userAgent: z.string(),
  refreshVersion: z.number().default(1),
  accessVersion: z.number().default(1),
  lastUsed: z.string().datetime()
});

export type TTokenSession = z.infer<typeof TokenSessionSchema>;
export type TTokenSessionInsert = Omit<TTokenSession, TImmutableDBKeys>;
export type TTokenSessionUpdate = Partial<Omit<TTokenSession, TImmutableDBKeys>>;
