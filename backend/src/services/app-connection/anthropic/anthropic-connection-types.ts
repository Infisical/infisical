import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  AnthropicConnectionSchema,
  CreateAnthropicConnectionSchema,
  ValidateAnthropicConnectionCredentialsSchema
} from "./anthropic-connection-schemas";

export type TAnthropicConnection = z.infer<typeof AnthropicConnectionSchema>;

export type TAnthropicConnectionInput = z.infer<typeof CreateAnthropicConnectionSchema> & {
  app: AppConnection.Anthropic;
};

export type TValidateAnthropicConnectionCredentialsSchema = typeof ValidateAnthropicConnectionCredentialsSchema;

export type TAnthropicConnectionConfig = DiscriminativePick<
  TAnthropicConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};
