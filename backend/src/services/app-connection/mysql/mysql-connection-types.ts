import z from "zod";

import { AppConnection } from "../app-connection-enums";
import {
  CreateMySqlConnectionSchema,
  MySqlConnectionSchema,
  ValidateMySqlConnectionCredentialsSchema
} from "./mysql-connection-schemas";

export type TMySqlConnection = z.infer<typeof MySqlConnectionSchema>;

export type TMySqlConnectionInput = z.infer<typeof CreateMySqlConnectionSchema> & {
  app: AppConnection.MySql;
};

export type TValidateMySqlConnectionCredentialsSchema = typeof ValidateMySqlConnectionCredentialsSchema;
