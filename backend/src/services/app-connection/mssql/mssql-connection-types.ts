import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateMsSqlConnectionSchema,
  MsSqlConnectionSchema,
  ValidateMsSqlConnectionCredentialsSchema
} from "./mssql-connection-schemas";

export type TMsSqlConnection = z.infer<typeof MsSqlConnectionSchema>;

export type TMsSqlConnectionInput = z.infer<typeof CreateMsSqlConnectionSchema> & {
  app: AppConnection.MsSql;
};

export type TValidateMsSqlConnectionCredentials = typeof ValidateMsSqlConnectionCredentialsSchema;

export type TMsSqlConnectionConfig = DiscriminativePick<
  TMsSqlConnectionInput,
  "method" | "app" | "credentials" | "isPlatformManaged"
> & {
  orgId: string;
};
