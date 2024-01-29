// Code generated by automation script, DO NOT EDIT.
// Automated by pulling database and generating zod schema
// To update. Just run npm run generate:schema
// Written by akhilmhdh.

import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const BackupPrivateKeySchema = z.object({
  id: z.string().uuid(),
  encryptedPrivateKey: z.string(),
  iv: z.string(),
  tag: z.string(),
  algorithm: z.string(),
  keyEncoding: z.string(),
  salt: z.string(),
  verifier: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  userId: z.string().uuid(),
});

export type TBackupPrivateKey = z.infer<typeof BackupPrivateKeySchema>;
export type TBackupPrivateKeyInsert = Omit<TBackupPrivateKey, TImmutableDBKeys>;
export type TBackupPrivateKeyUpdate = Partial<Omit<TBackupPrivateKey, TImmutableDBKeys>>;
