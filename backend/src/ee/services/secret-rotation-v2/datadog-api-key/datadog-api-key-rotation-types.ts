import { z } from "zod";

import { TDatadogConnection } from "@app/services/app-connection/datadog";

import {
  CreateDatadogApiKeyRotationSchema,
  DatadogApiKeyRotationGeneratedCredentialsSchema,
  DatadogApiKeyRotationListItemSchema,
  DatadogApiKeyRotationSchema
} from "./datadog-api-key-rotation-schemas";

export type TDatadogApiKeyRotation = z.infer<typeof DatadogApiKeyRotationSchema>;

export type TDatadogApiKeyRotationInput = z.infer<typeof CreateDatadogApiKeyRotationSchema>;

export type TDatadogApiKeyRotationListItem = z.infer<typeof DatadogApiKeyRotationListItemSchema>;

export type TDatadogApiKeyRotationWithConnection = TDatadogApiKeyRotation & {
  connection: TDatadogConnection;
};

export type TDatadogApiKeyRotationGeneratedCredentials = z.infer<
  typeof DatadogApiKeyRotationGeneratedCredentialsSchema
>;
