import { TDbProviderClients, TProviderFunctionTypes } from "./types";

export const MSSQL_TEMPLATE = {
  type: TProviderFunctionTypes.DB as const,
  client: TDbProviderClients.MsSqlServer,
  inputs: {
    type: "object" as const,
    properties: {
      admin_username: { type: "string" as const },
      admin_password: { type: "string" as const },
      host: { type: "string" as const },
      database: { type: "string" as const, default: "master" },
      port: { type: "integer" as const, default: "1433" },
      username1: {
        type: "string",
        default: "infisical-sql-user1",
        desc: "SQL Server login name that must be created at server level with a matching database user"
      },
      username2: {
        type: "string",
        default: "infisical-sql-user2",
        desc: "SQL Server login name that must be created at server level with a matching database user"
      },
      ca: { type: "string", desc: "SSL certificate for db auth(string)" }
    },
    required: ["admin_username", "admin_password", "host", "database", "username1", "username2", "port"],
    additionalProperties: false
  },
  outputs: {
    db_username: { type: "string" },
    db_password: { type: "string" }
  }
};
