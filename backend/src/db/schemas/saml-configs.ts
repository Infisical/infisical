// Code generated by automation script, DO NOT EDIT.
// Automated by pulling database and generating zod schema
// To update. Just run npm run generate:schema
// Written by akhilmhdh.

import { z } from "zod";

import { zodBuffer } from "@app/lib/zod";

import { TImmutableDBKeys } from "./models";

export const SamlConfigsSchema = z.object({
  id: z.string().uuid(),
  authProvider: z.string(),
  isActive: z.boolean(),
  encryptedEntryPoint: z.string().nullable().optional(),
  entryPointIV: z.string().nullable().optional(),
  entryPointTag: z.string().nullable().optional(),
  encryptedIssuer: z.string().nullable().optional(),
  issuerTag: z.string().nullable().optional(),
  issuerIV: z.string().nullable().optional(),
  encryptedCert: z.string().nullable().optional(),
  certIV: z.string().nullable().optional(),
  certTag: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  orgId: z.string().uuid(),
  lastUsed: z.date().nullable().optional(),
  encryptedSamlEntryPoint: zodBuffer,
  encryptedSamlIssuer: zodBuffer,
  encryptedSamlCertificate: zodBuffer
});

export type TSamlConfigs = z.infer<typeof SamlConfigsSchema>;
export type TSamlConfigsInsert = Omit<z.input<typeof SamlConfigsSchema>, TImmutableDBKeys>;
export type TSamlConfigsUpdate = Partial<Omit<z.input<typeof SamlConfigsSchema>, TImmutableDBKeys>>;
