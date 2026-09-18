import { z } from "zod";

import { TFireworksConnection } from "@app/services/app-connection/fireworks";

import {
  CreateFireworksApiKeyRotationSchema,
  FireworksApiKeyRotationGeneratedCredentialsSchema,
  FireworksApiKeyRotationListItemSchema,
  FireworksApiKeyRotationSchema
} from "./fireworks-api-key-rotation-schemas";

export type TFireworksApiKeyRotation = z.infer<typeof FireworksApiKeyRotationSchema>;

export type TFireworksApiKeyRotationInput = z.infer<typeof CreateFireworksApiKeyRotationSchema>;

export type TFireworksApiKeyRotationListItem = z.infer<typeof FireworksApiKeyRotationListItemSchema>;

export type TFireworksApiKeyRotationWithConnection = TFireworksApiKeyRotation & {
  connection: TFireworksConnection;
};

export type TFireworksApiKeyRotationGeneratedCredentials = z.infer<
  typeof FireworksApiKeyRotationGeneratedCredentialsSchema
>;

export type TFireworksApiKeyRotationGeneratedCredential = TFireworksApiKeyRotationGeneratedCredentials[number];
