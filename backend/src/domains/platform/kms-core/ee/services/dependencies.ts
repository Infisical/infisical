import { TExternalKmsAwsSchema, TExternalKmsProviderFns } from "@app/ee/services/external-kms/providers/model";

export type TAwsKmsProvider = TExternalKmsProviderFns & {
  generateInputKmsKey: () => Promise<TExternalKmsAwsSchema>;
};

export type TGcpKmsProvider = TExternalKmsProviderFns & {
  getKeysList: () => Promise<{ keys: string[] }>;
};

// Replaceable so tests can use a fake provider. The client validates `inputs`.
export type TExternalKmsProviders = {
  aws: (args: { inputs: unknown }) => Promise<TAwsKmsProvider>;
  gcp: (args: { inputs: unknown }) => Promise<TGcpKmsProvider>;
};
