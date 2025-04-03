import { z } from "zod";

import { AsymmetricKeySignVerify } from "../sign/types";

// Supported symmetric encrypt/decrypt algorithms
export enum SymmetricKeyEncryptDecrypt {
  AES_GCM_256 = "aes-256-gcm",
  AES_GCM_128 = "aes-128-gcm"
}
export const SymmetricKeyEncryptDecryptEnum = z.enum(
  Object.values(SymmetricKeyEncryptDecrypt) as [string, ...string[]]
).options;

export const AllowedEncryptionKeyAlgorithms = z.enum([
  ...Object.values(SymmetricKeyEncryptDecrypt),
  ...Object.values(AsymmetricKeySignVerify)
] as [string, ...string[]]).options;

export type TSymmetricEncryptionFns = {
  encrypt: (text: Buffer, key: Buffer) => Buffer;
  decrypt: (blob: Buffer, key: Buffer) => Buffer;
};
