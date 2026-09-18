import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateLiteLLMConnectionSchema,
  LiteLLMConnectionSchema,
  ValidateLiteLLMConnectionCredentialsSchema
} from "./litellm-connection-schemas";

export type TLiteLLMConnection = z.infer<typeof LiteLLMConnectionSchema>;

export type TLiteLLMConnectionInput = z.infer<typeof CreateLiteLLMConnectionSchema> & {
  app: AppConnection.LiteLLM;
};

export type TValidateLiteLLMConnectionCredentialsSchema = typeof ValidateLiteLLMConnectionCredentialsSchema;

export type TLiteLLMConnectionConfig = DiscriminativePick<TLiteLLMConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};
