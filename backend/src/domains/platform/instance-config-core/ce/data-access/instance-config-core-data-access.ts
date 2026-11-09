import { Knex } from "knex";

import { DataAccessDb } from "@app/domains/lib/data-access-db";

import { InstanceConfigDataAccess, TInstanceConfigDataAccess } from "./instance-config-data-access";

// Frozen: pods of the previous release take this id (PgSqlLock.SuperAdminInit) when they create the row at boot.
export const INSTANCE_CONFIG_INIT_LOCK_ID = 2024;

// Held until the transaction that took it ends.
export type TInstanceConfigCoreLocks = {
  init(): Promise<void>;
};

export class PostgresInstanceConfigCoreLocks implements TInstanceConfigCoreLocks {
  constructor(private readonly trx: Knex) {}

  async init() {
    await this.trx.raw("SELECT pg_advisory_xact_lock(?)", [INSTANCE_CONFIG_INIT_LOCK_ID]);
  }
}

// Outside a transaction a lock would be released at once, so it refuses.
export const noInstanceConfigCoreLocks: TInstanceConfigCoreLocks = {
  init: () => Promise.reject(new Error("Instance Config Core locks are only available inside a transaction"))
};

export type TInstanceConfigCoreDataAccess = {
  instanceConfig: TInstanceConfigDataAccess;
  locks: TInstanceConfigCoreLocks;
};

export const buildInstanceConfigCoreDataAccess = (
  db: DataAccessDb,
  locks: TInstanceConfigCoreLocks
): TInstanceConfigCoreDataAccess => ({
  instanceConfig: new InstanceConfigDataAccess(db),
  locks
});
