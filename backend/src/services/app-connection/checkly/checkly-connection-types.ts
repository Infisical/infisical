import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  ChecklyConnectionSchema,
  CreateChecklyConnectionSchema,
  ValidateChecklyConnectionCredentialsSchema
} from "./checkly-connection-schemas";

export type TChecklyConnection = z.infer<typeof ChecklyConnectionSchema>;

export type TChecklyConnectionInput = z.infer<typeof CreateChecklyConnectionSchema> & {
  app: AppConnection.Checkly;
};

export type TValidateChecklyConnectionCredentialsSchema = typeof ValidateChecklyConnectionCredentialsSchema;

export type TChecklyConnectionConfig = DiscriminativePick<TChecklyConnection, "method" | "app" | "credentials"> & {
  orgId: string;
};

export type TChecklyVariable = {
  key: string;
  value: string;
  locked: boolean;
  secret: boolean;
};

export type TChecklyAccount = {
  id: string;
  name: string;
  runtimeId: string;
};
