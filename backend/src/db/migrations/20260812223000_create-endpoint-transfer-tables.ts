import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.EndpointTransferBucket))) {
    await knex.schema.createTable(TableName.EndpointTransferBucket, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("deviceId").notNullable();
      t.foreign("deviceId").references("id").inTable(TableName.EndpointDevice).onDelete("CASCADE");

      // No network rule and no threshold: this is the record of where the device's traffic went,
      // which is a question that stands whether or not an admin wrote a rule about it.
      t.string("destination").notNullable();

      // The agent reports what it sent since its last heartbeat, a second or two apart. One row per
      // destination per minute is what makes the history readable rather than a wall of deltas, and
      // it is the unit the console reads a peak rate off.
      t.datetime("bucketStartedAt").notNullable();
      t.bigint("bytesOut").notNullable().defaultTo(0);

      // The bucket is a minute wide, so these are what give the console an honest span to show for a
      // transfer that started or ended part way through one.
      t.datetime("firstSeenAt").notNullable();
      t.datetime("lastSeenAt").notNullable();

      t.boolean("blocked").notNullable().defaultTo(false);

      t.unique(["deviceId", "destination", "bucketStartedAt"]);
      // The console always asks for one device over a trailing range, and the unique index above
      // leads with the destination it does not filter on.
      t.index(["deviceId", "bucketStartedAt"]);

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.EndpointTransferBucket);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.EndpointTransferBucket);
  await dropOnUpdateTrigger(knex, TableName.EndpointTransferBucket);
}
