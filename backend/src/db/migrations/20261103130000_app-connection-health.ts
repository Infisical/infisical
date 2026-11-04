import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.AppConnectionHealth)) return;

  // Whether the syncs and the rotations using each connection are working, written by sync and rotation runs. It
  // lives outside app_connections so those runs never touch the connection row, whose updatedAt means "last edited".
  // No row, or a null column, means nothing on the connection has worked yet.
  await knex.schema.createTable(TableName.AppConnectionHealth, (t) => {
    t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
    t.uuid("connectionId").notNullable().unique();
    t.foreign("connectionId").references("id").inTable(TableName.AppConnection).onDelete("CASCADE");
    t.boolean("syncFailing").nullable();
    t.boolean("rotationFailing").nullable();
    t.timestamps(true, true, true);
  });
  await createOnUpdateTrigger(knex, TableName.AppConnectionHealth);

  // Without this, every connection that is already broken would report a new breakage on its next failure, spread
  // over weeks because syncs only run when secrets change. Syncs: a connection has worked once any of its syncs has
  // succeeded, and is failing when any of them is failing now. Rotations: every rotation succeeds once when it is
  // created, so a connection with rotations has worked, and is failing when any of them is.
  await knex.raw(
    `
    INSERT INTO ?? ("connectionId", "syncFailing", "rotationFailing")
    SELECT c.id, s."syncFailing", r."rotationFailing"
    FROM ?? AS c
    LEFT JOIN (
      SELECT "connectionId", COALESCE(bool_or("lastSyncResult" = 'failed'), false) AS "syncFailing"
      FROM ??
      GROUP BY "connectionId"
      HAVING bool_or("lastSyncResult" = 'succeeded' OR "lastSyncedAt" IS NOT NULL)
    ) AS s ON s."connectionId" = c.id
    LEFT JOIN (
      SELECT "connectionId", bool_or("rotationStatus" = 'failed') AS "rotationFailing"
      FROM ??
      GROUP BY "connectionId"
    ) AS r ON r."connectionId" = c.id
    WHERE s."connectionId" IS NOT NULL OR r."connectionId" IS NOT NULL
    `,
    [TableName.AppConnectionHealth, TableName.AppConnection, TableName.SecretSync, TableName.SecretRotationV2]
  );
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.AppConnectionHealth);
  await knex.schema.dropTableIfExists(TableName.AppConnectionHealth);
}
