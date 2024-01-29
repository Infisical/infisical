// Code generated by automation script, DO NOT EDIT.
// Automated by pulling database and generating zod schema
// To update. Just run npm run generate:schema
// Written by akhilmhdh.

import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const SecretVersionTagJunctionSchema = z.object({
  id: z.string().uuid(),
  secret_versionsId: z.string().uuid(),
  secret_tagsId: z.string().uuid(),
});

export type TSecretVersionTagJunction = z.infer<typeof SecretVersionTagJunctionSchema>;
export type TSecretVersionTagJunctionInsert = Omit<TSecretVersionTagJunction, TImmutableDBKeys>;
export type TSecretVersionTagJunctionUpdate = Partial<Omit<TSecretVersionTagJunction, TImmutableDBKeys>>;
