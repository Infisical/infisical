import { z } from "zod";

import { TDatadogConnection } from "@app/services/app-connection/datadog";

import {
  CreateDatadogApplicationKeySecretRotationSchema,
  DatadogApplicationKeySecretRotationGeneratedCredentialsSchema,
  DatadogApplicationKeySecretRotationListItemSchema,
  DatadogApplicationKeySecretRotationSchema
} from "./datadog-application-key-secret-rotation-schemas";

export type TDatadogApplicationKeySecretRotation = z.infer<typeof DatadogApplicationKeySecretRotationSchema>;

export type TDatadogApplicationKeySecretRotationInput = z.infer<typeof CreateDatadogApplicationKeySecretRotationSchema>;

export type TDatadogApplicationKeySecretRotationListItem = z.infer<
  typeof DatadogApplicationKeySecretRotationListItemSchema
>;

export type TDatadogApplicationKeySecretRotationWithConnection = TDatadogApplicationKeySecretRotation & {
  connection: TDatadogConnection;
};

export type TDatadogApplicationKeySecretRotationGeneratedCredentials = z.infer<
  typeof DatadogApplicationKeySecretRotationGeneratedCredentialsSchema
>;
