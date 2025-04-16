import { z } from "zod";

import { DiscriminativePick } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import {
  Auth0ConnectionSchema,
  CreateAuth0ConnectionSchema,
  ValidateAuth0ConnectionCredentialsSchema
} from "./auth0-connection-schemas";

export type TAuth0Connection = z.infer<typeof Auth0ConnectionSchema>;

export type TAuth0ConnectionInput = z.infer<typeof CreateAuth0ConnectionSchema> & {
  app: AppConnection.Auth0;
};

export type TValidateAuth0ConnectionCredentialsSchema = typeof ValidateAuth0ConnectionCredentialsSchema;

export type TAuth0ConnectionConfig = DiscriminativePick<TAuth0Connection, "method" | "app" | "credentials"> & {
  orgId: string;
};

export type TAuth0AccessTokenResponse = {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

export type TAuth0ListClient = {
  name: string;
  client_id: string;
};

export type TAuth0ListClientsResponse = {
  total: number;
  clients: TAuth0ListClient[];
};
