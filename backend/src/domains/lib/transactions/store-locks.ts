import { Knex } from "knex";

export type TStoreLocks = {
  // Held until the transaction that took it ends.
  acquire(key: string): Promise<void>;
};

export class PostgresStoreLocks implements TStoreLocks {
  constructor(private readonly trx: Knex) {}

  async acquire(key: string): Promise<void> {
    await this.trx.raw("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", [key]);
  }
}
