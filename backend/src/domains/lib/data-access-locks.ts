import { Knex } from "knex";

export type TDataAccessLocks = {
  // Held until the transaction that took it ends.
  acquire(key: string): Promise<void>;
};

export class PostgresDataAccessLocks implements TDataAccessLocks {
  constructor(private readonly trx: Knex) {}

  async acquire(key: string): Promise<void> {
    await this.trx.raw("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", [key]);
  }
}
