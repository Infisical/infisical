import { z } from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  AzureCertificateConnectionClientSecretOutputCredentialsSchema,
  AzureCertificateConnectionOAuthOutputCredentialsSchema,
  AzureCertificateConnectionSchema,
  CreateAzureCertificateConnectionSchema,
  ValidateAzureCertificateConnectionCredentialsSchema
} from "./azure-certificate-connection-schemas";

export type TAzureCertificateConnection = z.infer<typeof AzureCertificateConnectionSchema>;

export type TAzureCertificateConnectionInput = z.infer<typeof CreateAzureCertificateConnectionSchema> & {
  app: AppConnection.AzureCertificate;
};

export type TValidateAzureCertificateConnectionCredentialsSchema =
  typeof ValidateAzureCertificateConnectionCredentialsSchema;

export type TAzureCertificateConnectionConfig = DiscriminativePick<
  TAzureCertificateConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};

export type TAzureCertificateConnectionCredentials = z.infer<
  typeof AzureCertificateConnectionOAuthOutputCredentialsSchema
>;

export type TAzureCertificateConnectionClientSecretCredentials = z.infer<
  typeof AzureCertificateConnectionClientSecretOutputCredentialsSchema
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
