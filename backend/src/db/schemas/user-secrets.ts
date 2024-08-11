// Code generated by automation script, DO NOT EDIT.
// Automated by pulling database and generating zod schema
// To update. Just run npm run generate:schema
// Written by akhilmhdh.

import { z } from "zod";

import { zodBuffer } from "@app/lib/zod";

import { TImmutableDBKeys } from "./models";

export const UserSecretsSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  secretType: z.string(),
  name: z.string(),
  loginURL: z.string().nullable().optional(),
  username: zodBuffer.nullable().optional(),
  password: zodBuffer.nullable().optional(),
  isUsernameSecret: z.boolean().default(false).nullable().optional(),
  cardNumber: zodBuffer.nullable().optional(),
  cardExpiry: zodBuffer.nullable().optional(),
  cardCvv: zodBuffer.nullable().optional(),
  cardLastFourDigits: z.string().nullable().optional(),
  secureNote: zodBuffer.nullable().optional(),
  iv: z.string(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type TUserSecrets = z.infer<typeof UserSecretsSchema>;
export type TUserSecretsInsert = Omit<z.input<typeof UserSecretsSchema>, TImmutableDBKeys>;
export type TUserSecretsUpdate = Partial<Omit<z.input<typeof UserSecretsSchema>, TImmutableDBKeys>>;
