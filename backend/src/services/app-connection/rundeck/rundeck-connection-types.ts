import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateRundeckConnectionSchema,
  RundeckConnectionSchema,
  ValidateRundeckConnectionCredentialsSchema
} from "./rundeck-connection-schemas";

export type TRundeckConnection = z.infer<typeof RundeckConnectionSchema>;

export type TRundeckConnectionInput = z.infer<typeof CreateRundeckConnectionSchema> & {
  app: AppConnection.Rundeck;
};

export type TValidateRundeckConnectionCredentialsSchema = typeof ValidateRundeckConnectionCredentialsSchema;

export type TRundeckConnectionConfig = DiscriminativePick<TRundeckConnectionInput, "method" | "app" | "credentials">;

export type TRundeckProject = {
  name: string;
};
