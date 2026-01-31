import { z } from "zod";

import { TDbtConnection, TDbtStatusResponse } from "@app/services/app-connection/dbt";

import {
  CreateDbtServiceTokenRotationSchema,
  DbtServiceTokenRotationGeneratedCredentialsSchema,
  DbtServiceTokenRotationListItemSchema,
  DbtServiceTokenRotationSchema,
  DbtTokenPermissionsSchema
} from "./dbt-service-token-rotation-schemas";

type DbtTokenPermissions = z.infer<typeof DbtTokenPermissionsSchema>;

export type TDbtServiceTokenRotation = z.infer<typeof DbtServiceTokenRotationSchema>;

export type TDbtServiceTokenRotationInput = z.infer<typeof CreateDbtServiceTokenRotationSchema>;

export type TDbtServiceTokenRotationListItem = z.infer<typeof DbtServiceTokenRotationListItemSchema>;

export type TDbtServiceTokenRotationWithConnection = TDbtServiceTokenRotation & {
  connection: TDbtConnection;
};

export type TDbtServiceTokenRotationGeneratedCredentials = z.infer<
  typeof DbtServiceTokenRotationGeneratedCredentialsSchema
>;

export interface TDbtServiceTokenRotationParameters {
  permissionGrants: DbtTokenPermissions[];
  tokenName: string;
}

export interface TDbtServiceTokenRotationSecretsMapping {
  serviceToken: string;
}

export interface TCreateDbtServiceTokenResponse extends TDbtStatusResponse {
  data: {
    id: number; // token ID
    token_string: string; // plaintext token
    name: string; // token name
  };
}

export interface TGetDbtServiceTokenResponse extends TDbtStatusResponse {
  data: {
    id: number;
  };
}
