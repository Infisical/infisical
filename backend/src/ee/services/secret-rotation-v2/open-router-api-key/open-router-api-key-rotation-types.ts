import { z } from "zod";

import { TOpenRouterConnection } from "@app/services/app-connection/open-router";

import {
  CreateOpenRouterApiKeyRotationSchema,
  OpenRouterApiKeyRotationGeneratedCredentialsSchema,
  OpenRouterApiKeyRotationListItemSchema,
  OpenRouterApiKeyRotationSchema
} from "./open-router-api-key-rotation-schemas";

export type TOpenRouterApiKeyRotation = z.infer<typeof OpenRouterApiKeyRotationSchema>;

export type TOpenRouterApiKeyRotationInput = z.infer<typeof CreateOpenRouterApiKeyRotationSchema>;

export type TOpenRouterApiKeyRotationListItem = z.infer<typeof OpenRouterApiKeyRotationListItemSchema>;

export type TOpenRouterApiKeyRotationWithConnection = TOpenRouterApiKeyRotation & {
  connection: TOpenRouterConnection;
};

export type TOpenRouterApiKeyRotationGeneratedCredentials = z.infer<
  typeof OpenRouterApiKeyRotationGeneratedCredentialsSchema
>;

export interface TOpenRouterApiKeyRotationParameters {
  name: string;
  limit?: number | null;
  limitReset?: "daily" | "weekly" | "monthly" | null;
}

export interface TOpenRouterApiKeyRotationSecretsMapping {
  apiKey: string;
}

export interface TOpenRouterApiKeyCreateResponse {
  data: {
    hash: string;
    name: string;
    label: string;
    disabled: boolean;
    limit: number | null;
    created_at: string;
  };
  key: string;
}
