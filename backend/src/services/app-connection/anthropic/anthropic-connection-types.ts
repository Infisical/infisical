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

export type TAnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export type TAnthropicMessage = {
  role: "user" | "assistant";
  content: string | TAnthropicContentBlock[];
};

export type TAnthropicTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type TAnthropicMessageRequest = {
  model: string;
  max_tokens: number;
  system?: string;
  messages: TAnthropicMessage[];
  tools?: TAnthropicTool[];
  tool_choice?: { type: "auto" } | { type: "any" } | { type: "tool"; name: string };
};

export type TAnthropicMessageResponse = {
  id: string;
  model: string;
  stop_reason: string | null;
  content: TAnthropicContentBlock[];
};
