import { type ClickHouseClient } from "@clickhouse/client";

import { logger } from "@app/lib/logger";

const buildCreateAuditLogsTableSQL = (tableName: string, engine: string) => `
CREATE TABLE IF NOT EXISTS ${tableName}
(
    id UUID,
    actor LowCardinality(String),
    actorMetadata JSON,
    ipAddress String,
    eventType LowCardinality(String),
    eventMetadata JSON,
    userAgent LowCardinality(String),
    userAgentType LowCardinality(String),
    createdAt DateTime64(6) CODEC(DoubleDelta, ZSTD(3)),
    orgId UUID,
    projectId String,
)
ENGINE = ${engine}
PARTITION BY toYYYYMM(createdAt)
PRIMARY KEY (orgId, projectId, createdAt, id)
ORDER BY (orgId, projectId, createdAt, id)
`;

export type TEnsureClickHouseSchemaOpts = {
  client: ClickHouseClient;
  tableName: string;
  engine: string;
};

/**
 * Ensure the ClickHouse audit_logs table exists.
 * If the table already exists, this is a no-op (CREATE TABLE IF NOT EXISTS).
 */
export const ensureClickHouseSchema = async ({ client, tableName, engine }: TEnsureClickHouseSchemaOpts) => {
  logger.info({ tableName }, "Ensuring ClickHouse audit_logs table exists");

  await client.exec({
    query: "SET allow_experimental_json_type = 1",
    clickhouse_settings: {
      wait_end_of_query: 1
    }
  });

  await client.exec({
    query: buildCreateAuditLogsTableSQL(tableName, engine),
    clickhouse_settings: {
      wait_end_of_query: 1
    }
  });

  logger.info({ tableName }, "ClickHouse audit_logs table ready");
};
