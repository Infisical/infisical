import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateOpenAIConnectionSchema,
  OpenAIConnectionSchema,
  ValidateOpenAIConnectionCredentialsSchema
} from "./openai-connection-schemas";

export type TOpenAIConnection = z.infer<typeof OpenAIConnectionSchema>;

export type TOpenAIConnectionInput = z.infer<typeof CreateOpenAIConnectionSchema> & {
  app: AppConnection.OpenAI;
};

export type TValidateOpenAIConnectionCredentialsSchema = typeof ValidateOpenAIConnectionCredentialsSchema;

export type TOpenAIConnectionConfig = DiscriminativePick<TOpenAIConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};

export type TOpenAIProject = {
  id: string;
  name: string;
  status: string;
  created_at: number;
  archived_at: number | null;
};

export type TOpenAIListProjectsResponse = {
  object: string;
  data: TOpenAIProject[];
  first_id: string;
  last_id: string;
  has_more: boolean;
};
