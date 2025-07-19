import { z } from "zod";

import { TOktaConnection } from "@app/services/app-connection/okta";

import {
  CreateOktaClientSecretRotationSchema,
  OktaClientSecretRotationGeneratedCredentialsSchema,
  OktaClientSecretRotationListItemSchema,
  OktaClientSecretRotationSchema
} from "./okta-client-secret-rotation-schemas";

export type TOktaClientSecretRotation = z.infer<typeof OktaClientSecretRotationSchema>;

export type TOktaClientSecretRotationInput = z.infer<typeof CreateOktaClientSecretRotationSchema>;

export type TOktaClientSecretRotationListItem = z.infer<typeof OktaClientSecretRotationListItemSchema>;

export type TOktaClientSecretRotationWithConnection = TOktaClientSecretRotation & {
  connection: TOktaConnection;
};

export type TOktaClientSecretRotationGeneratedCredentials = z.infer<
  typeof OktaClientSecretRotationGeneratedCredentialsSchema
>;

export interface TOktaClientSecretRotationParameters {
  clientId: string;
  secretId: string;
}

export interface TOktaClientSecretRotationSecretsMapping {
  clientId: string;
  clientSecret: string;
  secretId: string;
}

export interface TOktaClientSecret {
  id: string;
  client_secret: string;
}
