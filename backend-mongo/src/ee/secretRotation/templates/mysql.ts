import { TAssignOp, TDbProviderClients, TProviderFunctionTypes } from "../types";

export const MYSQL_TEMPLATE = {
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
    required: [
      "admin_username",
      "admin_password",
      "host",
      "database",
      "username1",
      "username2",
      "port"
    ],
    additionalProperties: false
  },
  outputs: {
    db_username: { type: "string" },
    db_password: { type: "string" }
  },
  internal: {
    rotated_password: { type: "string" },
    username: { type: "string" }
  },
  functions: {
    set: {
      type: TProviderFunctionTypes.DB as const,
      client: TDbProviderClients.Sql,
      username: "${inputs.admin_username}",
      password: "${inputs.admin_password}",
      host: "${inputs.host}",
      database: "${inputs.database}",
      port: "${inputs.port}",
      ca: "${inputs.ca}",
      query: "ALTER USER ${internal.username} IDENTIFIED BY '${internal.rotated_password}'",
      setter: {
        "outputs.db_username": {
          assign: TAssignOp.Direct as const,
          value: "${internal.username}"
        },
        "outputs.db_password": {
          assign: TAssignOp.Direct as const,
          value: "${internal.rotated_password}"
        }
      },
      pre: {
        "internal.rotated_password": {
          assign: TAssignOp.Direct as const,
          value: "${random | 32}"
        }
      }
    },
    test: {
      type: TProviderFunctionTypes.DB as const,
      client: TDbProviderClients.Sql,
      username: "${internal.username}",
      password: "${internal.rotated_password}",
      host: "${inputs.host}",
      database: "${inputs.database}",
      port: "${inputs.port}",
      ca: "${inputs.ca}",
      query: "SELECT NOW()"
    }
  }
};
