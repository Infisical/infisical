import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  AzureConnectionOAuthOutputCredentialsSchema,
  AzureConnectionSchema,
  CreateAzureConnectionSchema,
  ValidateAzureConnectionCredentialsSchema
} from "./azure-connection-schemas";

export type TAzureConnection = z.infer<typeof AzureConnectionSchema>;

export type TAzureConnectionInput = z.infer<typeof CreateAzureConnectionSchema> & {
  app: AppConnection.Azure;
};

export type TValidateAzureConnectionCredentials = typeof ValidateAzureConnectionCredentialsSchema;

export type TAzureConnectionConfig = DiscriminativePick<TAzureConnectionInput, "method" | "app" | "credentials"> & {
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

export type TAzureConnectionCredentials = z.infer<typeof AzureConnectionOAuthOutputCredentialsSchema>;
