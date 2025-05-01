import { z } from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  AzureClientSecretsConnectionOAuthOutputCredentialsSchema,
  AzureClientSecretsConnectionSchema,
  CreateAzureClientSecretsConnectionSchema,
  ValidateAzureClientSecretsConnectionCredentialsSchema
} from "./azure-client-secrets-connection-schemas";

export type TAzureClientSecretsConnection = z.infer<typeof AzureClientSecretsConnectionSchema>;

export type TAzureClientSecretsConnectionInput = z.infer<typeof CreateAzureClientSecretsConnectionSchema> & {
  app: AppConnection.AzureClientSecrets;
};

export type TValidateAzureClientSecretsConnectionCredentialsSchema =
  typeof ValidateAzureClientSecretsConnectionCredentialsSchema;

export type TAzureClientSecretsConnectionConfig = DiscriminativePick<
  TAzureClientSecretsConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};

export type TAzureClientSecretsConnectionCredentials = z.infer<
  typeof AzureClientSecretsConnectionOAuthOutputCredentialsSchema
>;

export interface ExchangeCodeAzureResponse {
  token_type: string;
  scope: string;
  expires_in: number;
  ext_expires_in: number;
  access_token: string;
  refresh_token: string;
  id_token: string;
}

export interface TAzureRegisteredApp {
  id: string;
  appId: string;
  displayName: string;
  description?: string;
  createdDateTime: string;
  identifierUris?: string[];
  signInAudience?: string;
}

export interface TAzureListRegisteredAppsResponse {
  "@odata.context": string;
  "@odata.nextLink"?: string;
  value: TAzureRegisteredApp[];
}

export interface TAzureClientSecret {
  keyId: string;
  displayName?: string;
  startDateTime: string;
  endDateTime: string;
  secretText?: string;
}
