import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateDatadogConnectionSchema,
  DatadogConnectionSchema,
  ValidateDatadogConnectionCredentialsSchema
} from "./datadog-connection-schemas";

export type TDatadogConnection = z.infer<typeof DatadogConnectionSchema>;

export type TDatadogConnectionInput = z.infer<typeof CreateDatadogConnectionSchema> & {
  app: AppConnection.Datadog;
};

export type TValidateDatadogConnectionCredentialsSchema = typeof ValidateDatadogConnectionCredentialsSchema;

export type TDatadogConnectionConfig = DiscriminativePick<TDatadogConnectionInput, "method" | "app" | "credentials">;

export type TDatadogServiceAccount = {
  id: string;
  name: string;
};
