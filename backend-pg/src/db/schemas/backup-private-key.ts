import { z } from "zod";

import { SecretEncryptionAlgo, SecretKeyEncoding, TImmutableDBKeys } from "./models";

export const BackupPrivateKeySchema = z.object({
  id: z.string(),
  userId: z.string(),
  encryptedPrivateKey: z.string(),
  iv: z.string(),
  tag: z.string(),
  algorithm: z.nativeEnum(SecretEncryptionAlgo),
  keyEncoding: z.nativeEnum(SecretKeyEncoding),
  salt: z.string(),
  verifier: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type TBackupPrivateKey = z.infer<typeof BackupPrivateKeySchema>;
export type TBackupPrivateKeyInsert = Omit<TBackupPrivateKey, TImmutableDBKeys>;
export type TBackupPrivateKeyUpdate = Partial<Omit<TBackupPrivateKey, TImmutableDBKeys>>;
