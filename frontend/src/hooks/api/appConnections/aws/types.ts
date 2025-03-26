import { SecretSync } from "@app/hooks/api/secretSyncs";

export type TListAwsConnectionKmsKeys = {
  connectionId: string;
  region: string;
  destination: SecretSync.AWSParameterStore | SecretSync.AWSSecretsManager;
};

export type TAwsConnectionKmsKey = {
  alias: string;
  id: string;
};

export type TAwsConnectionListKmsKeysResponse = {
  kmsKeys: TAwsConnectionKmsKey[];
};
