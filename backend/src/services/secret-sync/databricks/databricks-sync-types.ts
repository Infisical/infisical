import { z } from "zod";

import { TDatabricksConnection, TDatabricksRequestConfig } from "@app/services/app-connection/databricks";

import {
  CreateDatabricksSyncSchema,
  DatabricksSyncListItemSchema,
  DatabricksSyncSchema
} from "./databricks-sync-schemas";

export type TDatabricksSync = z.infer<typeof DatabricksSyncSchema>;

export type TDatabricksSyncInput = z.infer<typeof CreateDatabricksSyncSchema>;

export type TDatabricksSyncListItem = z.infer<typeof DatabricksSyncListItemSchema>;

export type TDatabricksSyncWithCredentials = TDatabricksSync & {
  connection: TDatabricksConnection;
};

export type TDatabricksListSecretKeysResponse = {
  secrets?: { key: string; last_updated_timestamp: number }[];
};

type TBaseDatabricksSecretRequest = {
  scope: string;
  connection: TDatabricksRequestConfig;
  accessToken: string;
};

export type TDatabricksListSecretKeys = TBaseDatabricksSecretRequest;

export type TDatabricksPutSecret = {
  key: string;
  value?: string;
} & TBaseDatabricksSecretRequest;

export type TDatabricksDeleteSecret = {
  key: string;
} & TBaseDatabricksSecretRequest;
