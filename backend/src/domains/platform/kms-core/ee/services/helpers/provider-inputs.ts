import { RuleViolationError } from "@app/domains/lib/errors";
import {
  ExternalKmsAwsSchema,
  ExternalKmsGcpSchema,
  KmsProviders,
  TExternalKmsAwsSchema,
  TExternalKmsGcpSchema
} from "@app/ee/services/external-kms/providers/model";

import { TCipherPair } from "../../../ce/models/data-key";
import { TExternalKeyRef } from "../../../ce/models/external-key-config";

export type TProviderInput = TExternalKmsAwsSchema | TExternalKmsGcpSchema;

export type TOpenedInputs =
  | { type: KmsProviders.Aws; inputs: TExternalKmsAwsSchema }
  | { type: KmsProviders.Gcp; inputs: TExternalKmsGcpSchema };

// Inputs are encrypted with the data key of the key's org.
export const openProviderInputs = (ref: TExternalKeyRef, orgCipher: TCipherPair): TOpenedInputs => {
  const raw = JSON.parse(
    orgCipher.decryptor({ cipherTextBlob: ref.encryptedProviderInputs }).toString("utf8")
  ) as unknown;
  switch (ref.provider) {
    case KmsProviders.Aws:
      return { type: KmsProviders.Aws, inputs: ExternalKmsAwsSchema.parse(raw) };
    case KmsProviders.Gcp:
      return { type: KmsProviders.Gcp, inputs: ExternalKmsGcpSchema.parse(raw) };
    default:
      throw new RuleViolationError({ message: "Invalid KMS provider." });
  }
};

export const providerError = (provider: string, error: unknown, fallback: string) => {
  if (error instanceof RuleViolationError) return error;
  return new RuleViolationError({ message: error instanceof Error ? `${provider} error: ${error.message}` : fallback });
};
