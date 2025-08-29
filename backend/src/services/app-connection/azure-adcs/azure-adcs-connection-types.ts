import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  AzureADCSConnectionSchema,
  CreateAzureADCSConnectionSchema,
  ValidateAzureADCSConnectionCredentialsSchema
} from "./azure-adcs-connection-schemas";

export type TAzureADCSConnection = z.infer<typeof AzureADCSConnectionSchema>;

export type TAzureADCSConnectionInput = z.infer<typeof CreateAzureADCSConnectionSchema> & {
  app: AppConnection.AzureADCS;
};

export type TValidateAzureADCSConnectionCredentialsSchema = typeof ValidateAzureADCSConnectionCredentialsSchema;

export type TAzureADCSConnectionConfig = DiscriminativePick<
  TAzureADCSConnectionInput,
  "method" | "app" | "credentials"
>;
