/**
 * CLI entry point for ensuring ClickHouse schema exists.
 *
 * Usage: tsx ./src/db/run-clickhouse-migrations.ts
 *
 * Required environment variables:
 *   CLICKHOUSE_URL - ClickHouse connection URL
 *
 * Optional environment variables:
 *   CLICKHOUSE_AUDIT_LOG_ENGINE - Engine clause for the audit_logs table
 *     Default: ReplacingMergeTree
 *   CLICKHOUSE_AUDIT_LOG_TABLE_NAME - Table name for audit logs
 *     Default: audit_logs
 */
import path from "node:path";

import dotenv from "dotenv";

import { initLogger } from "@app/lib/logger";

import { buildClickHouseFromConfig } from "../lib/config/clickhouse";
import { ensureClickHouseSchema } from "./clickhouse-migration-runner";

dotenv.config({
  path: path.join(__dirname, "../../../.env.migration")
});
dotenv.config({
  path: path.join(__dirname, "../../../.env")
});

const DEFAULT_ENGINE = "ReplacingMergeTree";
const DEFAULT_TABLE_NAME = "audit_logs";

const main = async () => {
  const clickhouseUrl = process.env.CLICKHOUSE_URL;

  if (!clickhouseUrl) {
    // eslint-disable-next-line no-console
    console.info("CLICKHOUSE_URL not set. Nothing to do.");
    process.exit(0);
  }

  const client = buildClickHouseFromConfig({ CLICKHOUSE_URL: clickhouseUrl });
  if (!client) {
    // eslint-disable-next-line no-console
    console.error("Failed to create ClickHouse client.");
    process.exit(1);
  }

  const engine = process.env.CLICKHOUSE_AUDIT_LOG_ENGINE || DEFAULT_ENGINE;
  const tableName = process.env.CLICKHOUSE_AUDIT_LOG_TABLE_NAME || DEFAULT_TABLE_NAME;

  // eslint-disable-next-line no-console
  console.info("Ensuring ClickHouse schema...");

  const logger = initLogger();

  try {
    await ensureClickHouseSchema({
      client,
      tableName,
      engine,
      logger
    });

    // eslint-disable-next-line no-console
    console.info("ClickHouse schema ready.");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("ClickHouse schema setup failed:", err);
    process.exit(1);
  } finally {
    await client.close();
  }
};

void main();
