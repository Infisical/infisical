import z from "zod";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import {
  CreateOracleDBConnectionSchema,
  OracleDBConnectionSchema,
  ValidateOracleDBConnectionCredentialsSchema
} from "./oracledb-connection-schemas";

export type TOracleDBConnection = z.infer<typeof OracleDBConnectionSchema>;

export type TOracleDBConnectionInput = z.infer<typeof CreateOracleDBConnectionSchema> & {
  app: AppConnection.OracleDB;
};

export type TValidateOracleDBConnectionCredentialsSchema = typeof ValidateOracleDBConnectionCredentialsSchema;
