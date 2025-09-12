import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  AzureAppConfigurationConnectionClientSecretOutputCredentialsSchema,
  AzureAppConfigurationConnectionOAuthOutputCredentialsSchema,
  AzureAppConfigurationConnectionSchema,
  CreateAzureAppConfigurationConnectionSchema,
  ValidateAzureAppConfigurationConnectionCredentialsSchema
} from "./azure-app-configuration-connection-schemas";

export type TAzureAppConfigurationConnection = z.infer<typeof AzureAppConfigurationConnectionSchema>;

export type TAzureAppConfigurationConnectionInput = z.infer<typeof CreateAzureAppConfigurationConnectionSchema> & {
  app: AppConnection.AzureAppConfiguration;
};

export type TValidateAzureAppConfigurationConnectionCredentialsSchema =
  typeof ValidateAzureAppConfigurationConnectionCredentialsSchema;

export type TAzureAppConfigurationConnectionConfig = DiscriminativePick<
  TAzureAppConfigurationConnectionInput,
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

export type TAzureAppConfigurationConnectionCredentials = z.infer<
  typeof AzureAppConfigurationConnectionOAuthOutputCredentialsSchema
>;

export type TAzureAppConfigurationConnectionClientSecretCredentials = z.infer<
  typeof AzureAppConfigurationConnectionClientSecretOutputCredentialsSchema
>;
