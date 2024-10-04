// Code generated by automation script, DO NOT EDIT.
// Automated by pulling database and generating zod schema
// To update. Just run npm run generate:schema
// Written by akhilmhdh.

import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const UserSecretCredentialsSchema = z.object({
  id: z.string().uuid(),
  credentialId: z.string().uuid().nullable().optional(),
  credentialType: z.string(),
  name: z.string(),
  data: z.string(),
  createdAt: z.date().nullable().optional(),
  updatedAt: z.date().nullable().optional()
});

export type TUserSecretCredentials = z.infer<typeof UserSecretCredentialsSchema>;
export type TUserSecretCredentialsInsert = Omit<z.input<typeof UserSecretCredentialsSchema>, TImmutableDBKeys>;
export type TUserSecretCredentialsUpdate = Partial<Omit<z.input<typeof UserSecretCredentialsSchema>, TImmutableDBKeys>>;