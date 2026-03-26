import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const UserAuthenticationsSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: z.string(),
  externalId: z.string().nullable().optional(),
  domain: z.string(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type TUserAuthentications = z.infer<typeof UserAuthenticationsSchema>;
export type TUserAuthenticationsInsert = Omit<z.input<typeof UserAuthenticationsSchema>, TImmutableDBKeys>;
export type TUserAuthenticationsUpdate = Partial<Omit<z.input<typeof UserAuthenticationsSchema>, TImmutableDBKeys>>;
