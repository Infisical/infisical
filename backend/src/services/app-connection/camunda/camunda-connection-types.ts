import { z } from "zod";

import { DiscriminativePick } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import {
  CamundaConnectionSchema,
  CreateCamundaConnectionSchema,
  ValidateCamundaConnectionCredentialsSchema
} from "./camunda-connection-schema";

export type TCamundaConnection = z.infer<typeof CamundaConnectionSchema>;

export type TCamundaConnectionInput = z.infer<typeof CreateCamundaConnectionSchema> & {
  app: AppConnection.Camunda;
};

export type TValidateCamundaConnectionCredentialsSchema = typeof ValidateCamundaConnectionCredentialsSchema;

export type TCamundaConnectionConfig = DiscriminativePick<TCamundaConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};

export type TAuthorizeCamundaConnection = {
  access_token: string;
  scope: string;
  token_type: string;
  expires_in: number;
};

export type TCamundaListClustersResponse = { uuid: string; name: string }[];
