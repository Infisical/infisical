// eslint-disable-next-line
import "ts-node/register";

import dotenv from "dotenv";
import type { Knex } from "knex";
import path from "path";
import { getMigrationEnvConfig } from "./migrations/utils/env-config";

// Update with your config settings. .
dotenv.config({
  path: path.join(__dirname, "../../../.env.migration")
});
dotenv.config({
  path: path.join(__dirname, "../../../.env")
});

const envConfig = getMigrationEnvConfig();

export default {
  development: {
    client: "postgres",
    connection: {
      connectionString: envConfig.DB_CONNECTION_URI,
      host: envConfig.DB_HOST,
      port: envConfig.DB_PORT,
      user: envConfig.DB_USER,
      database: envConfig.DB_NAME,
      password: envConfig.DB_PASSWORD,
      ssl: envConfig.DB_ROOT_CERT
        ? {
            rejectUnauthorized: true,
            ca: Buffer.from(envConfig.DB_ROOT_CERT, "base64").toString("ascii")
          }
        : false
    },
    pool: {
      min: 2,
      max: 10
    },
    seeds: {
      directory: "./seeds"
    },
    migrations: {
      tableName: "infisical_migrations"
    }
  },
  production: {
    client: "postgres",
    connection: {
      connectionString: envConfig.DB_CONNECTION_URI,
      host: envConfig.DB_HOST,
      port: envConfig.DB_PORT,
      user: envConfig.DB_USER,
      database: envConfig.DB_NAME,
      password: envConfig.DB_PASSWORD,
      ssl: envConfig.DB_ROOT_CERT
        ? {
            rejectUnauthorized: true,
            ca: Buffer.from(envConfig.DB_ROOT_CERT, "base64").toString("ascii")
          }
        : false
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: "infisical_migrations"
    }
  }
} as Knex.Config;
