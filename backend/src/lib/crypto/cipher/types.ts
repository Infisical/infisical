import { z } from "zod";

import { AsymmetricKeyAlgorithm } from "../sign/types";
import { HmacAlgorithm } from "../hmac";

// Supported symmetric encrypt/decrypt algorithms
export enum SymmetricKeyAlgorithm {
  AES_GCM_256 = "aes-256-gcm",
  AES_GCM_128 = "aes-128-gcm"
}
export const SymmetricKeyAlgorithmEnum = z.enum(Object.values(SymmetricKeyAlgorithm) as [string, ...string[]]).options;

export const AllowedEncryptionKeyAlgorithms = z.enum([
  ...Object.values(SymmetricKeyAlgorithm),
  ...Object.values(AsymmetricKeyAlgorithm),
  ...Object.values(HmacAlgorithm)
] as [string, ...string[]]).options;

const NonImportableEncryptionKeyAlgorithms = new Set<string>([
  SymmetricKeyAlgorithm.AES_GCM_128,
  AsymmetricKeyAlgorithm.ML_DSA_44,
  AsymmetricKeyAlgorithm.ML_DSA_65,
  AsymmetricKeyAlgorithm.ML_DSA_87
]);

export const ImportableEncryptionKeyAlgorithms = AllowedEncryptionKeyAlgorithms.filter(
  (algorithm) => !NonImportableEncryptionKeyAlgorithms.has(algorithm)
);

export type TSymmetricEncryptionFns = {
  encrypt: (text: Buffer, key: Buffer) => Buffer;
  decrypt: (blob: Buffer, key: Buffer) => Buffer;
};
