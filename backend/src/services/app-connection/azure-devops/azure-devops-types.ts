import { z } from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  AzureDevOpsConnectionClientSecretOutputCredentialsSchema,
  AzureDevOpsConnectionOAuthOutputCredentialsSchema,
  AzureDevOpsConnectionSchema,
  CreateAzureDevOpsConnectionSchema,
  ValidateAzureDevOpsConnectionCredentialsSchema
} from "./azure-devops-schemas";

export type TAzureDevOpsConnection = z.infer<typeof AzureDevOpsConnectionSchema>;

export type TAzureDevOpsConnectionInput = z.infer<typeof CreateAzureDevOpsConnectionSchema> & {
  app: AppConnection.AzureDevOps;
};

export type TValidateAzureDevOpsConnectionCredentialsSchema = typeof ValidateAzureDevOpsConnectionCredentialsSchema;

export type TAzureDevOpsConnectionConfig = DiscriminativePick<
  TAzureDevOpsConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};

export type TAzureDevOpsConnectionCredentials = z.infer<typeof AzureDevOpsConnectionOAuthOutputCredentialsSchema>;

export type TAzureDevOpsConnectionClientSecretCredentials = z.infer<
  typeof AzureDevOpsConnectionClientSecretOutputCredentialsSchema
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
