import { type ClickHouseClient } from "@clickhouse/client";
import { Logger } from "pino";

const buildCreateAuditLogsTableSQL = (tableName: string, engine: string) => `CREATE TABLE IF NOT EXISTS ${tableName}
(
    id UUID DEFAULT generateUUIDv7(),
    actor LowCardinality(String),
    actorMetadata String CODEC(ZSTD(3)),
    ipAddress String,
    eventType LowCardinality(String),
    eventMetadata String CODEC(ZSTD(3)),
    userAgent LowCardinality(String),
    userAgentType LowCardinality(String),
    createdAt DateTime64(6) CODEC(DoubleDelta, ZSTD(3)),
    orgId UUID,
    projectId String,
    expiresAt DateTime64(6),
    INDEX idx_createdAt createdAt TYPE minmax GRANULARITY 1
)
ENGINE = ${engine}
PARTITION BY toYYYYMM(createdAt)
PRIMARY KEY (orgId, projectId, createdAt, id)
ORDER BY (orgId, projectId, createdAt, id)
TTL toDateTime(expiresAt)
SETTINGS index_granularity = 8192
`;

export type TEnsureClickHouseSchemaOpts = {
  client: ClickHouseClient;
  tableName: string;
  engine: string;
  logger: Logger;
};

/**
 * Ensure the ClickHouse audit_logs table exists.
 * If the table already exists, this is a no-op (CREATE TABLE IF NOT EXISTS).
 */
export const ensureClickHouseSchema = async ({ client, tableName, engine, logger }: TEnsureClickHouseSchemaOpts) => {
  logger.info({ tableName }, "Ensuring ClickHouse audit_logs table exists");

  await client.exec({
    query: buildCreateAuditLogsTableSQL(tableName, engine),
    clickhouse_settings: {
      wait_end_of_query: 1
    }
  });

  logger.info({ tableName }, "ClickHouse audit_logs table ready");
};
