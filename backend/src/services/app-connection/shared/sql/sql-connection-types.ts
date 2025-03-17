import z from "zod";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { BaseSqlUsernameAndPasswordConnectionSchema } from "./sql-connection-schemas";

export type TBaseSqlConnectionCredentialsSchema = z.infer<typeof BaseSqlUsernameAndPasswordConnectionSchema>;

export type TSqlConnectionQueryParams = {
  credentials: TBaseSqlConnectionCredentialsSchema;
  app: AppConnection.Postgres | AppConnection.MsSql;
  query: string;
  variables?: unknown[];
  options?: Record<string, unknown>;
};
