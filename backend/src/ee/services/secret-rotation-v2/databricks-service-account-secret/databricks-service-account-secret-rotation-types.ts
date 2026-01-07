import { z } from "zod";

import { TDatabricksConnection } from "@app/services/app-connection/databricks/databricks-connection-types";

import {
  CreateDatabricksServiceAccountSecretRotationSchema,
  DatabricksServiceAccountSecretRotationGeneratedCredentialsSchema,
  DatabricksServiceAccountSecretRotationListItemSchema,
  DatabricksServiceAccountSecretRotationSchema
} from "./databricks-service-account-secret-rotation-schemas";

export type TDatabricksServiceAccountSecretRotation = z.infer<typeof DatabricksServiceAccountSecretRotationSchema>;

export type TDatabricksServiceAccountSecretRotationInput = z.infer<
  typeof CreateDatabricksServiceAccountSecretRotationSchema
>;

export type TDatabricksServiceAccountSecretRotationListItem = z.infer<
  typeof DatabricksServiceAccountSecretRotationListItemSchema
>;

export type TDatabricksServiceAccountSecretRotationWithConnection = TDatabricksServiceAccountSecretRotation & {
  connection: TDatabricksConnection;
};

export type TDatabricksServiceAccountSecretRotationGeneratedCredentials = z.infer<
  typeof DatabricksServiceAccountSecretRotationGeneratedCredentialsSchema
>;

export interface TDatabricksServiceAccountSecretRotationParameters {
  servicePrincipalId: string;
  servicePrincipalName?: string;
  clientId?: string;
}

export interface TDatabricksServiceAccountSecretRotationSecretsMapping {
  clientId: string;
  clientSecret: string;
}

export interface DatabricksGenerateSecretResponse {
  client_secret: string;
  id: string;
}
