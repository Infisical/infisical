import { z } from "zod";

import { TOpenAIConnection } from "@app/services/app-connection/openai";

import {
  CreateOpenAIAdminApiKeyRotationSchema,
  OpenAIAdminApiKeyRotationGeneratedCredentialsSchema,
  OpenAIAdminApiKeyRotationListItemSchema,
  OpenAIAdminApiKeyRotationSchema
} from "./openai-admin-api-key-rotation-schemas";

export type TOpenAIAdminApiKeyRotation = z.infer<typeof OpenAIAdminApiKeyRotationSchema>;

export type TOpenAIAdminApiKeyRotationInput = z.infer<typeof CreateOpenAIAdminApiKeyRotationSchema>;

export type TOpenAIAdminApiKeyRotationListItem = z.infer<typeof OpenAIAdminApiKeyRotationListItemSchema>;

export type TOpenAIAdminApiKeyRotationWithConnection = TOpenAIAdminApiKeyRotation & {
  connection: TOpenAIConnection;
};

export type TOpenAIAdminApiKeyRotationGeneratedCredentials = z.infer<
  typeof OpenAIAdminApiKeyRotationGeneratedCredentialsSchema
>;

export interface TOpenAIAdminApiKeyRotationParameters {
  name: string;
}

export interface TOpenAIAdminApiKeyRotationSecretsMapping {
  apiKey: string;
}

export interface TOpenAIAdminApiKeyCreateResponse {
  object: string;
  id: string;
  name: string;
  redacted_value: string;
  value: string;
  created_at: number;
}
