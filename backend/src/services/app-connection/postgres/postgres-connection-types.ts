import z from "zod";

import { AppConnection } from "../app-connection-enums";
import {
  CreatePostgresConnectionSchema,
  PostgresConnectionSchema,
  ValidatePostgresConnectionCredentialsSchema
} from "./postgres-connection-schemas";

export type TPostgresConnection = z.infer<typeof PostgresConnectionSchema>;

export type TPostgresConnectionInput = z.infer<typeof CreatePostgresConnectionSchema> & {
  app: AppConnection.Postgres;
};

export type TValidatePostgresConnectionCredentialsSchema = typeof ValidatePostgresConnectionCredentialsSchema;
