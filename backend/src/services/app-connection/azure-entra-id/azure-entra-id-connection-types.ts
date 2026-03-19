import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  AzureEntraIdConnectionClientSecretOutputCredentialsSchema,
  AzureEntraIdConnectionSchema,
  CreateAzureEntraIdConnectionSchema,
  ValidateAzureEntraIdConnectionCredentialsSchema
} from "./azure-entra-id-connection-schemas";

export type TAzureEntraIdConnection = z.infer<typeof AzureEntraIdConnectionSchema>;

export type TAzureEntraIdConnectionInput = z.infer<typeof CreateAzureEntraIdConnectionSchema> & {
  app: AppConnection.AzureEntraId;
};

export type TValidateAzureEntraIdConnectionCredentialsSchema = typeof ValidateAzureEntraIdConnectionCredentialsSchema;

export type TAzureEntraIdConnectionConfig = DiscriminativePick<
  TAzureEntraIdConnectionInput,
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
};

export type TAzureEntraIdConnectionClientSecretCredentials = z.infer<
  typeof AzureEntraIdConnectionClientSecretOutputCredentialsSchema
>;
