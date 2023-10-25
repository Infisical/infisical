import {
  ISecretRotationProviderTemplate,
  TProviderFunctionTypes,
  TDbProviderClients,
  TAssignOp
} from "./types";

const SENDGRID_TEMPLATE = {
  inputs: {
    type: "object" as const,
    properties: {
      admin_api_key: { type: "string" as const },
      scopes: { type: "array", items: { type: "string" as const } }
    },
    required: ["admin_api_key", "scopes"],
    additionalProperties: false
  },
  outputs: {
    api_key: { type: "string" }
  },
  internal: {
    api_key_id: { type: "string" }
  },
  functions: {
    set: {
      type: TProviderFunctionTypes.HTTP as const,
      url: "https://api.sendgrid.com/v3/api_keys",
      method: "POST",
      header: {
        Authorization: "Bearer ${inputs.admin_api_key}"
      },
      body: {
        name: "infisical-${random | 16}",
        scopes: { ref: "inputs.scopes" }
      },
      setter: {
        "outputs.api_key": {
          assign: TAssignOp.JmesPath as const,
          path: "api_key"
        },
        "internal.api_key_id": {
          assign: TAssignOp.JmesPath as const,
          path: "api_key_id"
        }
      }
    },
    remove: {
      type: TProviderFunctionTypes.HTTP as const,
      url: "https://api.sendgrid.com/v3/api_keys/${internal.api_key_id}",
      header: {
        Authorization: "Bearer ${inputs.admin_api_key}"
      },
      method: "DELETE"
    },
    test: {
      type: TProviderFunctionTypes.HTTP as const,
      url: "https://api.sendgrid.com/v3/api_keys/${internal.api_key_id}",
      header: {
        Authorization: "Bearer ${inputs.admin_api_key}"
      },
      method: "GET"
    }
  }
};

const POSTGRES_TEMPLATE = {
  inputs: {
    type: "object" as const,
    properties: {
      admin_username: { type: "string" as const },
      admin_password: { type: "string" as const },
      host: { type: "string" as const },
      database: { type: "string" as const },
      port: { type: "integer" as const, default: "5432" },
      username1: { type: "string", default: "infisical-pg-user1" },
      username2: { type: "string", default: "infisical-pg-user2" }
    },
    required: ["admin_username", "admin_password", "host", "database"],
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
      client: TDbProviderClients.Pg,
      username: "${inputs.admin_username}",
      password: "${inputs.admin_password}",
      host: "${inputs.host}",
      database: "${inputs.database}",
      port: "${inputs.port}",
      query: "ALTER USER ${internal.username} WITH PASSWORD '${internal.rotated_password}'",
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
      client: TDbProviderClients.Pg,
      username: "${internal.username}",
      password: "${internal.rotated_password}",
      host: "${inputs.host}",
      database: "${inputs.database}",
      port: "${inputs.port}",
      query: "SELECT NOW()"
    }
  }
};

const MYSQL_TEMPLATE = {
  inputs: {
    type: "object" as const,
    properties: {
      admin_username: { type: "string" as const },
      admin_password: { type: "string" as const },
      host: { type: "string" as const },
      database: { type: "string" as const },
      port: { type: "integer" as const, default: "3306" },
      username1: { type: "string", default: "infisical-sql-user1" },
      username2: { type: "string", default: "infisical-sql-user2" }
    },
    required: ["admin_username", "admin_password", "host", "database"],
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
      query:
        "ALTER USER ${internal.username} IDENTIFIED WITH mysql_native_password BY '${internal.rotated_password}'",
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
      query: "SELECT NOW()"
    }
  }
};

export const providerRotationTemplates: ISecretRotationProviderTemplate[] = [
  {
    name: "sendgrid",
    title: "Twilio Sendgrid",
    image: "sendgrid.png",
    description: "Rotate Twilio Sendgrid API keys",
    template: SENDGRID_TEMPLATE
  },
  {
    name: "postgres",
    title: "PostgreSQL",
    image: "postgres.png",
    description: "Rotate PostgreSQL/CockroachDB user credentials",
    template: POSTGRES_TEMPLATE
  },
  {
    name: "mysql",
    title: "MySQL",
    image: "mysql.png",
    description: "Rotate MySQL@7/MariaDB user credentials",
    template: MYSQL_TEMPLATE
  }
];
