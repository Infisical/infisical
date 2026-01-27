// eslint-disable-next-line
/* eslint-disable no-console */
import "ts-node/register";

import dotenv from "dotenv";
import type { Knex } from "knex";
import path from "path";

// Update with your config settings. .
dotenv.config({
  path: path.join(__dirname, "../../../.env.migration")
});
dotenv.config({
  path: path.join(__dirname, "../../../.env")
});

if (!process.env.AUDIT_LOGS_DB_CONNECTION_URI && !process.env.AUDIT_LOGS_DB_HOST) {
  console.info("Dedicated audit log database not found. No further migrations necessary");
  process.exit(0);
}

console.info("Executing migration on audit log database...");

export default {
  development: {
    client: "postgres",
    connection: {
      connectionString: process.env.AUDIT_LOGS_DB_CONNECTION_URI,
      host: process.env.AUDIT_LOGS_DB_HOST,
      port: process.env.AUDIT_LOGS_DB_PORT,
      user: process.env.AUDIT_LOGS_DB_USER,
      database: process.env.AUDIT_LOGS_DB_NAME,
      password: process.env.AUDIT_LOGS_DB_PASSWORD,
      ssl: process.env.AUDIT_LOGS_DB_ROOT_CERT
        ? {
            rejectUnauthorized: true,
            ca: Buffer.from(process.env.AUDIT_LOGS_DB_ROOT_CERT, "base64").toString("ascii")
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
      connectionString: process.env.AUDIT_LOGS_DB_CONNECTION_URI,
      host: process.env.AUDIT_LOGS_DB_HOST,
      port: process.env.AUDIT_LOGS_DB_PORT,
      user: process.env.AUDIT_LOGS_DB_USER,
      database: process.env.AUDIT_LOGS_DB_NAME,
      password: process.env.AUDIT_LOGS_DB_PASSWORD,
      ssl: process.env.AUDIT_LOGS_DB_ROOT_CERT
        ? {
            rejectUnauthorized: true,
            ca: Buffer.from(process.env.AUDIT_LOGS_DB_ROOT_CERT, "base64").toString("ascii")
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
