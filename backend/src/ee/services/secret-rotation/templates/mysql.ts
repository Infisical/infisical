import { TDbProviderClients, TProviderFunctionTypes } from "./types";

export const MYSQL_TEMPLATE = {
  type: TProviderFunctionTypes.DB as const,
  client: TDbProviderClients.MySql,
  inputs: {
    type: "object" as const,
    properties: {
      admin_username: { type: "string" as const },
      admin_password: { type: "string" as const },
      host: { type: "string" as const },
      database: { type: "string" as const },
      port: { type: "integer" as const, default: "3306" },
      username1: {
        type: "string",
        default: "infisical-sql-user1",
        desc: "This user must be created in your database"
      },
      username2: {
        type: "string",
        default: "infisical-sql-user2",
        desc: "This user must be created in your database"
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
