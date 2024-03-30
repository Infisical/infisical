// Code generated by automation script, DO NOT EDIT.
// Automated by pulling database and generating zod schema
// To update. Just run npm run generate:schema
// Written by akhilmhdh.

import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const WebhooksSchema = z.object({
  id: z.string().uuid(),
  secretPath: z.string().default("/"),
  url: z.string(),
  lastStatus: z.string().nullable().optional(),
  lastRunErrorMessage: z.string().nullable().optional(),
  isDisabled: z.boolean().default(false),
  encryptedSecretKey: z.string().nullable().optional(),
  iv: z.string().nullable().optional(),
  tag: z.string().nullable().optional(),
  algorithm: z.string().nullable().optional(),
  keyEncoding: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  envId: z.string().uuid()
});

export type TWebhooks = z.infer<typeof WebhooksSchema>;
export type TWebhooksInsert = Omit<z.input<typeof WebhooksSchema>, TImmutableDBKeys>;
export type TWebhooksUpdate = Partial<Omit<z.input<typeof WebhooksSchema>, TImmutableDBKeys>>;
