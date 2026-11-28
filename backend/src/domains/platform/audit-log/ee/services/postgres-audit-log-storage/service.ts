import type { TAuditLogs } from "@app/db/schemas";
import type { TTransactionRunner } from "@app/domains/lib/transactions";
import type { TInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/module";

import type { TAuditLogStores, TAuditLogWriter } from "../dependencies";

// Ingestion stores through any TAuditLogWriter; this is the Postgres one.
export type TPostgresAuditLogStorageService = TAuditLogWriter;

export class PostgresAuditLogStorageService implements TPostgresAuditLogStorageService {
  readonly backend = "postgres" as const;

  constructor(
    private readonly transactionRunner: TTransactionRunner<TAuditLogStores>,
    private readonly instanceConfigService: TInstanceConfigService
  ) {}

  // An instance admin can turn Postgres storage off at runtime, so the flag is read on every batch. The batch is
  // still delivered to consumers: log streams work without Postgres storage.
  async insertBatch(rows: TAuditLogs[]): Promise<void> {
    const { DISABLE_POSTGRES_AUDIT_LOG_STORAGE } = await this.instanceConfigService.getOverridableEnv();
    if (DISABLE_POSTGRES_AUDIT_LOG_STORAGE) return;
    await this.transactionRunner.run(({ stores }) => stores.auditLogStore.insertBatch(rows));
  }
}
