import { z } from "zod";

import { TOpenAIConnection } from "@app/services/app-connection/openai";

import {
  CreateOpenAIServiceAccountRotationSchema,
  OpenAIServiceAccountRotationGeneratedCredentialsSchema,
  OpenAIServiceAccountRotationListItemSchema,
  OpenAIServiceAccountRotationSchema
} from "./openai-service-account-rotation-schemas";

export type TOpenAIServiceAccountRotation = z.infer<typeof OpenAIServiceAccountRotationSchema>;

export type TOpenAIServiceAccountRotationInput = z.infer<typeof CreateOpenAIServiceAccountRotationSchema>;

export type TOpenAIServiceAccountRotationListItem = z.infer<typeof OpenAIServiceAccountRotationListItemSchema>;

export type TOpenAIServiceAccountRotationWithConnection = TOpenAIServiceAccountRotation & {
  connection: TOpenAIConnection;
};

export type TOpenAIServiceAccountRotationGeneratedCredentials = z.infer<
  typeof OpenAIServiceAccountRotationGeneratedCredentialsSchema
>;

export interface TOpenAIServiceAccountRotationParameters {
  projectId: string;
  name: string;
}

export interface TOpenAIServiceAccountRotationSecretsMapping {
  apiKey: string;
}

export interface TOpenAIServiceAccountCreateResponse {
  object: string;
  id: string;
  name: string;
  role: string;
  created_at: number;
  api_key: {
    object: string;
    id: string;
    name: string;
    value: string;
    created_at: number;
  };
}
