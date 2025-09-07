import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

const TABLE = TableName.SecretSync;
const JOIN_TABLE = "secret_sync_folders";

export async function up(knex: Knex): Promise<void> {
  const hasFolderId = await knex.schema.hasColumn(TABLE, "folderId");

  const hasJoinTable = await knex.schema.hasTable(JOIN_TABLE);
  if (!hasJoinTable) {
    await knex.schema.createTable(JOIN_TABLE, (t) => {
      t.uuid("secretSyncId").notNullable().references("id").inTable(TABLE).onDelete("CASCADE");

      t.uuid("folderId").notNullable().references("id").inTable("secret_folders").onDelete("CASCADE");

      t.primary(["secretSyncId", "folderId"]);
      t.timestamp("createdAt").defaultTo(knex.fn.now());
      t.timestamp("updatedAt").defaultTo(knex.fn.now());
    });
  }

  if (hasFolderId) {
    await knex.raw(`
      INSERT INTO "${JOIN_TABLE}" ("secretSyncId", "folderId", "createdAt", "updatedAt")
      SELECT id, "folderId", NOW(), NOW()
      FROM "${TABLE}"
      WHERE "folderId" IS NOT NULL
    `);

    await knex.schema.alterTable(TABLE, (t) => {
      t.dropForeign(["folderId"]);
      t.dropColumn("folderId");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn(TABLE, "folderId");

  if (!hasCol) {
    await knex.schema.alterTable(TABLE, (t) => {
      t.uuid("folderId").nullable();
      t.foreign("folderId").references("id").inTable("secret_folders").onDelete("SET NULL");
    });

    await knex.raw(`
      UPDATE "${TABLE}" s
      SET "folderId" = sub.folder_id
      FROM (
        SELECT DISTINCT ON ("secretSyncId") "secretSyncId", "folderId"
        FROM "${JOIN_TABLE}"
        ORDER BY "secretSyncId", "createdAt" ASC
      ) sub
      WHERE s.id = sub."secretSyncId"
    `);
  }

  const hasJoinTable = await knex.schema.hasTable(JOIN_TABLE);
  if (hasJoinTable) {
    await knex.schema.dropTable(JOIN_TABLE);
  }
}
