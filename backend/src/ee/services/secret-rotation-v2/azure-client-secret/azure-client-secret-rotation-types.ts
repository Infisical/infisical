import { z } from "zod";

import { TAzureClientSecretsConnection } from "@app/services/app-connection/azure-client-secrets";

import {
  AzureClientSecretRotationGeneratedCredentialsSchema,
  AzureClientSecretRotationListItemSchema,
  AzureClientSecretRotationSchema,
  CreateAzureClientSecretRotationSchema
} from "./azure-client-secret-rotation-schemas";

export type TAzureClientSecretRotation = z.infer<typeof AzureClientSecretRotationSchema>;

export type TAzureClientSecretRotationInput = z.infer<typeof CreateAzureClientSecretRotationSchema>;

export type TAzureClientSecretRotationListItem = z.infer<typeof AzureClientSecretRotationListItemSchema>;

export type TAzureClientSecretRotationWithConnection = TAzureClientSecretRotation & {
  connection: TAzureClientSecretsConnection;
};

export type TAzureClientSecretRotationGeneratedCredentials = z.infer<
  typeof AzureClientSecretRotationGeneratedCredentialsSchema
>;

export interface TAzureClientSecretRotationParameters {
  appId: string;
  keyId?: string;
  displayName?: string;
}

export interface TAzureClientSecretRotationSecretsMapping {
  appId: string;
  clientSecret: string;
  keyId: string;
}

export interface AzureAddPasswordResponse {
  secretText: string;
  keyId: string;
}
