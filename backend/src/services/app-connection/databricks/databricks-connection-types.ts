import { z } from "zod";

import { DiscriminativePick } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import {
  CreateDatabricksConnectionSchema,
  DatabricksConnectionSchema,
  ValidateDatabricksConnectionCredentialsSchema
} from "./databricks-connection-schemas";

export type TDatabricksConnection = z.infer<typeof DatabricksConnectionSchema>;

export type TDatabricksConnectionInput = z.infer<typeof CreateDatabricksConnectionSchema> & {
  app: AppConnection.Databricks;
};

export type TValidateDatabricksConnectionCredentialsSchema = typeof ValidateDatabricksConnectionCredentialsSchema;

export type TDatabricksConnectionConfig = DiscriminativePick<
  TDatabricksConnection,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};

export type TAuthorizeDatabricksConnection = {
  access_token: string;
  scope: string;
  token_type: string;
  expires_in: number;
};

export type TDatabricksListSecretScopesResponse = {
  scopes?: { name: string; backend_type: string; keyvault_metadata: { resource_id: string; dns_name: string } }[];
};

export type TDatabricksServicePrincipal = {
  id: string;
  displayName: string;
  applicationId?: string;
  active?: boolean;
};

export type TDatabricksListServicePrincipalsResponse = {
  Resources?: TDatabricksServicePrincipal[];
  totalResults?: number;
  itemsPerPage?: number;
  startIndex?: number;
};
