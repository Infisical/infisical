import z from "zod";

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

export type ExchangeCodeAzureResponse = {
  token_type: string;
  scope: string;
  expires_in: number;
  ext_expires_in: number;
  access_token: string;
  refresh_token: string;
  id_token: string;
};

export type TAzureClientSecretsConnectionCredentials = z.infer<
  typeof AzureClientSecretsConnectionOAuthOutputCredentialsSchema
>;
