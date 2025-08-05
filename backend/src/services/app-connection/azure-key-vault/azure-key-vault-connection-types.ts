import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  AzureKeyVaultConnectionClientSecretOutputCredentialsSchema,
  AzureKeyVaultConnectionOAuthOutputCredentialsSchema,
  AzureKeyVaultConnectionSchema,
  CreateAzureKeyVaultConnectionSchema,
  ValidateAzureKeyVaultConnectionCredentialsSchema
} from "./azure-key-vault-connection-schemas";

export type TAzureKeyVaultConnection = z.infer<typeof AzureKeyVaultConnectionSchema>;

export type TAzureKeyVaultConnectionInput = z.infer<typeof CreateAzureKeyVaultConnectionSchema> & {
  app: AppConnection.AzureKeyVault;
};

export type TValidateAzureKeyVaultConnectionCredentialsSchema = typeof ValidateAzureKeyVaultConnectionCredentialsSchema;

export type TAzureKeyVaultConnectionConfig = DiscriminativePick<
  TAzureKeyVaultConnectionInput,
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

export type TAzureKeyVaultConnectionCredentials = z.infer<typeof AzureKeyVaultConnectionOAuthOutputCredentialsSchema>;

export type TAzureKeyVaultConnectionClientSecretCredentials = z.infer<
  typeof AzureKeyVaultConnectionClientSecretOutputCredentialsSchema
>;
