import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.EndpointDeviceApp))) {
    await knex.schema.createTable(TableName.EndpointDeviceApp, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("deviceId").notNullable();
      t.foreign("deviceId").references("id").inTable(TableName.EndpointDevice).onDelete("CASCADE");

      t.string("name").notNullable();
      // Absent on a binary that is not a bundle, and on any platform without bundle identifiers, so
      // the install path is what identifies a row instead.
      t.string("bundleId", 512);
      t.string("version", 64);
      t.string("path", 1024).notNullable();

      // Where it came from on disk: a system-wide install, or one that only this user has. An admin
      // reads the second one differently — nobody approved it.
      t.string("source", 32).notNullable();

      // A snapshot of whether the app was running when the inventory was taken, not a live signal.
      // The console labels it with the report time so it is never read as "running right now".
      t.boolean("isRunning").notNullable().defaultTo(false);

      // firstSeenAt survives a re-report, so the console can say how long an app has been on the
      // machine rather than how long ago the last inventory ran.
      t.datetime("firstSeenAt").notNullable();
      t.datetime("lastSeenAt").notNullable();

      // An inventory replaces the previous one, and two bundles cannot share an install path.
      t.unique(["deviceId", "path"]);

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.EndpointDeviceApp);
  }

  if (!(await knex.schema.hasColumn(TableName.EndpointDevice, "appsReportedAt"))) {
    await knex.schema.alterTable(TableName.EndpointDevice, (t) => {
      // An empty inventory and one that never ran look identical in the app table, and they mean
      // very different things to whoever is reading the page.
      t.datetime("appsReportedAt");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.EndpointDevice, "appsReportedAt")) {
    await knex.schema.alterTable(TableName.EndpointDevice, (t) => {
      t.dropColumn("appsReportedAt");
    });
  }

  await knex.schema.dropTableIfExists(TableName.EndpointDeviceApp);
  await dropOnUpdateTrigger(knex, TableName.EndpointDeviceApp);
}
