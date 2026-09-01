import { z } from "zod";

import { TLiteLLMConnection } from "@app/services/app-connection/litellm";

import {
  CreateLiteLLMApiKeyRotationSchema,
  LiteLLMApiKeyRotationGeneratedCredentialsSchema,
  LiteLLMApiKeyRotationListItemSchema,
  LiteLLMApiKeyRotationSchema
} from "./litellm-api-key-rotation-schemas";

export type TLiteLLMApiKeyRotation = z.infer<typeof LiteLLMApiKeyRotationSchema>;

export type TLiteLLMApiKeyRotationInput = z.infer<typeof CreateLiteLLMApiKeyRotationSchema>;

export type TLiteLLMApiKeyRotationListItem = z.infer<typeof LiteLLMApiKeyRotationListItemSchema>;

export type TLiteLLMApiKeyRotationWithConnection = TLiteLLMApiKeyRotation & {
  connection: TLiteLLMConnection;
};

export type TLiteLLMApiKeyRotationGeneratedCredentials = z.infer<
  typeof LiteLLMApiKeyRotationGeneratedCredentialsSchema
>;

export interface TLiteLLMApiKeyGenerateResponse {
  key: string;
}
