import { TExternalKmsAwsSchema, TExternalKmsProviderFns } from "@app/ee/services/external-kms/providers/model";

export type TAwsKmsProvider = TExternalKmsProviderFns & {
  generateInputKmsKey: () => Promise<TExternalKmsAwsSchema>;
};

export type TGcpKmsProvider = TExternalKmsProviderFns & {
  getKeysList: () => Promise<{ keys: string[] }>;
};

// The provider clients, replaceable so tests can stand in a fake provider. `inputs` are validated by the client.
export type TExternalKmsProviders = {
  aws: (args: { inputs: unknown }) => Promise<TAwsKmsProvider>;
  gcp: (args: { inputs: unknown }) => Promise<TGcpKmsProvider>;
};
