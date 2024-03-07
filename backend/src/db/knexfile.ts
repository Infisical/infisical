// eslint-disable-next-line
import "ts-node/register";

import dotenv from "dotenv";
import type { Knex } from "knex";
import path from "path";

// Update with your config settings. .
dotenv.config({
  path: path.join(__dirname, "../../../.env.migration"),
  debug: true
});
dotenv.config({
  path: path.join(__dirname, "../../../.env"),
  debug: true
});
export default {
  development: {
    client: "postgres",
    connection: {
      connectionString: process.env.DB_CONNECTION_URI,
      ssl: process.env.DB_ROOT_CERT
        ? {
            rejectUnauthorized: true,
            ca: Buffer.from(process.env.DB_ROOT_CERT, "base64").toString("ascii")
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
      connectionString: process.env.DB_CONNECTION_URI,
      ssl: process.env.DB_ROOT_CERT
        ? {
            rejectUnauthorized: true,
            ca: Buffer.from(process.env.DB_ROOT_CERT, "base64").toString("ascii")
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
