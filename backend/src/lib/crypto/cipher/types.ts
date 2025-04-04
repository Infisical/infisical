import { z } from "zod";

import { AsymmetricKeyAlgorithm } from "../sign/types";

// Supported symmetric encrypt/decrypt algorithms
export enum SymmetricKeyAlgorithm {
  AES_GCM_256 = "aes-256-gcm",
  AES_GCM_128 = "aes-128-gcm"
}
export const SymmetricKeyAlgorithmEnum = z.enum(Object.values(SymmetricKeyAlgorithm) as [string, ...string[]]).options;

export const AllowedEncryptionKeyAlgorithms = z.enum([
  ...Object.values(SymmetricKeyAlgorithm),
  ...Object.values(AsymmetricKeyAlgorithm)
] as [string, ...string[]]).options;

export type TSymmetricEncryptionFns = {
  encrypt: (text: Buffer, key: Buffer) => Buffer;
  decrypt: (blob: Buffer, key: Buffer) => Buffer;
};
