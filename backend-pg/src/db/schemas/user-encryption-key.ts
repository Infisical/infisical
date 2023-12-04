import { z } from "zod";

import { PickRequired } from "@app/lib/types";

import { TImmutableDBKeys } from "./models";

export const UserEncryptionKey = z.object({
  id: z.number(),
  userId: z.string(),
  serverPrivateKey: z.string().optional().nullable(),
  clientPublicKey: z.string().optional().nullable(),
  encryptionVersion: z.number().default(1).optional(),
  protectedKey: z.string(),
  protectedKeyIV: z.string(),
  protectedKeyTag: z.string(),
  publicKey: z.string(),
  encryptedPrivateKey: z.string(),
  iv: z.string(),
  tag: z.string(),
  salt: z.string(),
  verifier: z.string()
});

export type TUserEncryptionKey = z.infer<typeof UserEncryptionKey>;
export type TUserEncryptionKeyInsert = Omit<PickRequired<TUserEncryptionKey>, TImmutableDBKeys>;
export type TUserEncryptionKeyUpdate = Partial<Omit<TUserEncryptionKey, TImmutableDBKeys>>;
