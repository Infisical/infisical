import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const TokenSchema = z.object({
  id: z.number(),
  type: z.enum(["emailConfirmation", "emailMfa", "organizationInvitation", "passwordReset"]),
  phoneNumber: z.string().optional(),
  tokenHash: z.string(),
  triesLeft: z.number().optional(),
  expiresAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  userId: z.string().optional()
});

export type TToken = z.infer<typeof TokenSchema>;
export type TTokenInsert = Omit<TToken, TImmutableDBKeys>;
export type TTokenUpdate = Partial<Omit<TToken, TImmutableDBKeys>>;
