import { Knex } from "knex";

import { TableName } from "../schemas";

// The partition cron keeps the same number of months ahead, so a read always has a partition to land in.
const PARTITION_MONTHS_AHEAD = 3;

const getUtcMonthStart = (date: Date, monthOffset: number) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset, 1));

const formatPartitionDate = (date: Date) => date.toISOString().slice(0, 10).replaceAll("-", "");

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SecretReadActivity))) {
    const createTableSql = knex.schema
      .createTable(TableName.SecretReadActivity, (t) => {
        // A folder or secret id. No foreign keys: each would need its own index, and rows of deleted
        // resources stop being updated, so their month's partition is dropped with them.
        t.uuid("objectId").notNullable();
        t.string("objectType", 32).notNullable();
        t.uuid("actorId").notNullable();
        t.string("actorType", 16).notNullable();
        // Left out of every index so that the daily update is a HOT update and never touches an index.
        t.datetime("lastReadAt", { useTz: true }).notNullable();
        // The UTC month of lastReadAt and the partition key, so old reads are dropped a month at a time instead
        // of deleted row by row. A reader gets one row per month.
        t.datetime("readMonth", { useTz: true }).notNullable();
        // objectType is part of the key because one secret can be read both with and without its references
        // expanded, and the two credit different secrets.
        t.primary(["objectId", "actorId", "objectType", "readMonth"]);
      })
      .toString();
    await knex.schema.raw(`${createTableSql} PARTITION BY RANGE ("readMonth")`);

    const now = new Date();
    for (let offset = 0; offset <= PARTITION_MONTHS_AHEAD; offset += 1) {
      const from = getUtcMonthStart(now, offset);
      const to = getUtcMonthStart(now, offset + 1);
      // fillfactor leaves room on each page for the updated row, which a HOT update needs.
      // eslint-disable-next-line no-await-in-loop
      await knex.raw(
        `CREATE TABLE ?? PARTITION OF ?? FOR VALUES FROM ('${from.toISOString()}') TO ('${to.toISOString()}') WITH (fillfactor = 90)`,
        [
          `${TableName.SecretReadActivity}_${formatPartitionDate(from)}_${formatPartitionDate(to)}`,
          TableName.SecretReadActivity
        ]
      );
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SecretReadActivity);
}
