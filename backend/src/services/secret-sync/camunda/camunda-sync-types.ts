import { z } from "zod";

import { TCamundaConnection } from "@app/services/app-connection/camunda";

import { CamundaSyncListItemSchema, CamundaSyncSchema, CreateCamundaSyncSchema } from "./camunda-sync-schemas";

export type TCamundaSync = z.infer<typeof CamundaSyncSchema>;

export type TCamundaSyncInput = z.infer<typeof CreateCamundaSyncSchema>;

export type TCamundaSyncListItem = z.infer<typeof CamundaSyncListItemSchema>;

export type TCamundaSyncWithCredentials = TCamundaSync & {
  connection: TCamundaConnection;
};

export type TCamundaListSecretsResponse = { [key: string]: string };

type TBaseCamundaSecretRequest = {
  accessToken: string;
  clusterUUID: string;
};

export type TCamundaListSecrets = TBaseCamundaSecretRequest;

export type TCamundaCreateSecret = {
  key: string;
  value?: string;
} & TBaseCamundaSecretRequest;

export type TCamundaPutSecret = {
  key: string;
  value?: string;
} & TBaseCamundaSecretRequest;

export type TCamundaDeleteSecret = {
  key: string;
} & TBaseCamundaSecretRequest;
