import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateGcpConnectionSchema,
  GcpConnectionSchema,
  ValidateGcpConnectionCredentialsSchema
} from "./gcp-connection-schemas";

export type TGcpConnection = z.infer<typeof GcpConnectionSchema>;

export type TGcpConnectionInput = z.infer<typeof CreateGcpConnectionSchema> & {
  app: AppConnection.GCP;
};

export type TValidateGcpConnectionCredentials = typeof ValidateGcpConnectionCredentialsSchema;

export type TGcpConnectionConfig = DiscriminativePick<TGcpConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};
