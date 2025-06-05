import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CoolifyConnectionSchema,
  CreateCoolifyConnectionSchema,
  ValidateCoolifyConnectionCredentialsSchema
} from "./coolify-connection-schemas";

export type TCoolifyConnection = z.infer<typeof CoolifyConnectionSchema>;

export type TCoolifyConnectionInput = z.infer<typeof CreateCoolifyConnectionSchema> & {
  app: AppConnection.Coolify;
};

export type TValidateCoolifyConnectionCredentialsSchema = typeof ValidateCoolifyConnectionCredentialsSchema;

export type TCoolifyConnectionConfig = DiscriminativePick<TCoolifyConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};
