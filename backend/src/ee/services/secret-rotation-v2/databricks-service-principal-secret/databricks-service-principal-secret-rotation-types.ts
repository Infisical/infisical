import { z } from "zod";

import { TDatabricksConnection } from "@app/services/app-connection/databricks/databricks-connection-types";

import {
  CreateDatabricksServicePrincipalSecretRotationSchema,
  DatabricksServicePrincipalSecretRotationGeneratedCredentialsSchema,
  DatabricksServicePrincipalSecretRotationListItemSchema,
  DatabricksServicePrincipalSecretRotationSchema
} from "./databricks-service-principal-secret-rotation-schemas";

export type TDatabricksServicePrincipalSecretRotation = z.infer<typeof DatabricksServicePrincipalSecretRotationSchema>;

export type TDatabricksServicePrincipalSecretRotationInput = z.infer<
  typeof CreateDatabricksServicePrincipalSecretRotationSchema
>;

export type TDatabricksServicePrincipalSecretRotationListItem = z.infer<
  typeof DatabricksServicePrincipalSecretRotationListItemSchema
>;

export type TDatabricksServicePrincipalSecretRotationWithConnection = TDatabricksServicePrincipalSecretRotation & {
  connection: TDatabricksConnection;
};

export type TDatabricksServicePrincipalSecretRotationGeneratedCredentials = z.infer<
  typeof DatabricksServicePrincipalSecretRotationGeneratedCredentialsSchema
>;

export interface TDatabricksServicePrincipalSecretRotationParameters {
  servicePrincipalId: string;
  servicePrincipalName?: string;
  clientId?: string;
}

export interface TDatabricksServicePrincipalSecretRotationSecretsMapping {
  clientId: string;
  clientSecret: string;
}

export interface DatabricksGenerateSecretResponse {
  client_secret: string;
  id: string;
}
