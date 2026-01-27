import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateOpenRouterConnectionSchema,
  OpenRouterConnectionSchema,
  ValidateOpenRouterConnectionCredentialsSchema
} from "./open-router-connection-schemas";

export type TOpenRouterConnection = z.infer<typeof OpenRouterConnectionSchema>;

export type TOpenRouterConnectionInput = z.infer<typeof CreateOpenRouterConnectionSchema> & {
  app: AppConnection.OpenRouter;
};

export type TValidateOpenRouterConnectionCredentialsSchema = typeof ValidateOpenRouterConnectionCredentialsSchema;

export type TOpenRouterConnectionConfig = DiscriminativePick<
  TOpenRouterConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};
