import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const UserSecretsSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  organization_id: z.string(),
  type: z.string(),
  username: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  card_number: z.string().nullable().optional(),
  expiry_date: z.date().nullable().optional(),
  cvv: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type TUserSecrets = z.infer<typeof UserSecretsSchema>;
export type TUserSecretsInsert = Omit<z.input<typeof UserSecretsSchema>, TImmutableDBKeys>;
export type TUserSecretsUpdate = Partial<Omit<z.input<typeof UserSecretsSchema>, TImmutableDBKeys>>;
