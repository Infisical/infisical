import type { ClickHouseClient as TClickHouseDriver } from "@clickhouse/client";

import type { TAuditLogs } from "@app/db/schemas";

import type { TAuditLogWriter } from "../../services/dependencies";

// The audit log table in ClickHouse. Its ReplacingMergeTree drops rows repeating an id, so a retried batch is safe.
export class ClickHouseClient implements TAuditLogWriter {
  readonly backend = "clickhouse" as const;

  constructor(
    private readonly driver: TClickHouseDriver,
    private readonly tableName: string,
    private readonly insertSettings: Record<string, string | number | boolean>
  ) {}

  async insertBatch(rows: TAuditLogs[]): Promise<void> {
    await this.driver.insert({
      table: this.tableName,
      clickhouse_settings: this.insertSettings,
      values: rows,
      format: "JSONEachRow"
    });
  }
}
