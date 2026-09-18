import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateGoDaddyConnectionSchema,
  GoDaddyConnectionSchema,
  ValidateGoDaddyConnectionCredentialsSchema
} from "./godaddy-connection-schemas";

export type TGoDaddyConnection = z.infer<typeof GoDaddyConnectionSchema>;

export type TGoDaddyConnectionInput = z.infer<typeof CreateGoDaddyConnectionSchema> & {
  app: AppConnection.GoDaddy;
};

export type TValidateGoDaddyConnectionCredentialsSchema = typeof ValidateGoDaddyConnectionCredentialsSchema;

export type TGoDaddyConnectionConfig = DiscriminativePick<TGoDaddyConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};
