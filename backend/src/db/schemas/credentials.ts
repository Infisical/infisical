// Code generated by automation script, DO NOT EDIT.
// Automated by pulling database and generating zod schema
// To update. Just run npm run generate:schema
// Written by akhilmhdh.

import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const CredentialsSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: z.string(),
  userId: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type TCredentials = z.infer<typeof CredentialsSchema>;
export type TCredentialsInsert = Omit<z.input<typeof CredentialsSchema>, TImmutableDBKeys>;
export type TCredentialsUpdate = Partial<Omit<z.input<typeof CredentialsSchema>, TImmutableDBKeys>>;
