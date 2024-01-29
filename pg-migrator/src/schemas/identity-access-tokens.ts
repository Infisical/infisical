// Code generated by automation script, DO NOT EDIT.
// Automated by pulling database and generating zod schema
// To update. Just run npm run generate:schema
// Written by akhilmhdh.

import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const IdentityAccessTokensSchema = z.object({
  id: z.string().uuid(),
  accessTokenTTL: z.number().default(2592000),
  accessTokenMaxTTL: z.number().default(2592000),
  accessTokenNumUses: z.number().default(0),
  accessTokenNumUsesLimit: z.number().default(0),
  accessTokenLastUsedAt: z.date().nullable().optional(),
  accessTokenLastRenewedAt: z.date().nullable().optional(),
  isAccessTokenRevoked: z.boolean().default(false),
  identityUAClientSecretId: z.string().nullable().optional(),
  identityId: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type TIdentityAccessTokens = z.infer<typeof IdentityAccessTokensSchema>;
export type TIdentityAccessTokensInsert = Omit<
  TIdentityAccessTokens,
  TImmutableDBKeys
>;
export type TIdentityAccessTokensUpdate = Partial<
  Omit<TIdentityAccessTokens, TImmutableDBKeys>
>;
