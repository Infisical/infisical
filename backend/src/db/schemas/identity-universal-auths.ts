// Code generated by automation script, DO NOT EDIT.
// Automated by pulling database and generating zod schema
// To update. Just run npm run generate:schema
// Written by akhilmhdh.

import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const IdentityUniversalAuthsSchema = z.object({
  id: z.string().uuid(),
  clientId: z.string(),
  accessTokenTTL: z.coerce.number().default(7200),
  accessTokenMaxTTL: z.coerce.number().default(7200),
  accessTokenNumUsesLimit: z.coerce.number().default(0),
  clientSecretTrustedIps: z.unknown(),
  accessTokenTrustedIps: z.unknown(),
  createdAt: z.date(),
  updatedAt: z.date(),
  identityId: z.string().uuid(),
  accessTokenPeriod: z.coerce.number().default(0)
});

export type TIdentityUniversalAuths = z.infer<typeof IdentityUniversalAuthsSchema>;
export type TIdentityUniversalAuthsInsert = Omit<z.input<typeof IdentityUniversalAuthsSchema>, TImmutableDBKeys>;
export type TIdentityUniversalAuthsUpdate = Partial<
  Omit<z.input<typeof IdentityUniversalAuthsSchema>, TImmutableDBKeys>
>;
