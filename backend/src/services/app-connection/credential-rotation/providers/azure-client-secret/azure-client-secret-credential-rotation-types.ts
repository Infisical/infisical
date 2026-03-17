import { z } from "zod";

import { AzureKeyVaultConnectionClientSecretInputCredentialsSchema } from "@app/services/app-connection/azure-key-vault";

// Strategy config types
export type TAzureClientSecretStrategyConfig = {
  objectId: string;
};

// Generated credentials types
export type TAzureClientSecretGeneratedCredential = {
  keyId: string;
  clientSecret: string;
  createdAt: string;
};

export type AzureErrorResponse = { error: { message: string } };

export type AzureAddPasswordResponse = {
  keyId: string;
  secretText: string;
  displayName: string;
  endDateTime: string;
};

export type TCreateAzureClientSecretDTO = {
  accessToken: string;
  connectionName: string;
  config: TAzureClientSecretStrategyConfig;
  rotationInterval: number;
  activeIndex: number;
  attempt?: number;
};
// exact same schema as AzureKeyVaultConnectionClientSecretInputCredentialsSchema
export const AzureClientSecretCredentialRotationCredentialsSchema =
  AzureKeyVaultConnectionClientSecretInputCredentialsSchema;

export type TAzureClientSecretCredentialRotationCredentials = z.infer<
  typeof AzureClientSecretCredentialRotationCredentialsSchema
>;
