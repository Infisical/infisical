import { TDbProviderClients, TProviderFunctionTypes } from "./types";

export const POSTGRES_TEMPLATE = {
  type: TProviderFunctionTypes.DB as const,
  client: TDbProviderClients.Pg as const,
  inputs: {
    type: "object" as const,
    properties: {
      admin_username: { type: "string" as const },
      admin_password: { type: "string" as const },
      host: { type: "string" as const },
      database: { type: "string" as const },
      port: { type: "integer" as const, default: "5432" },
      username1: {
        type: "string",
        default: "infisical-pg-user1",
        desc: "This user must be created in your database"
      },
      username2: {
        type: "string",
        default: "infisical-pg-user2",
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
