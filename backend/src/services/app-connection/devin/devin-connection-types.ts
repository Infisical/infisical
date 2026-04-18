import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateDevinConnectionSchema,
  DevinConnectionSchema,
  ValidateDevinConnectionCredentialsSchema
} from "./devin-connection-schemas";

export type TDevinConnection = z.infer<typeof DevinConnectionSchema>;

export type TDevinConnectionInput = z.infer<typeof CreateDevinConnectionSchema> & {
  app: AppConnection.Devin;
};

export type TValidateDevinConnectionCredentialsSchema = typeof ValidateDevinConnectionCredentialsSchema;

export type TDevinConnectionConfig = DiscriminativePick<TDevinConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};
