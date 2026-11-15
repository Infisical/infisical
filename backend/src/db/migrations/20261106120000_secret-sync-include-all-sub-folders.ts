import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.SecretSync, "includeAllSubFolders"))) {
    await knex.schema.alterTable(TableName.SecretSync, (t) => {
      t.boolean("includeAllSubFolders").notNullable().defaultTo(false);
    });

    // Syncs created before this column held the setting in syncOptions, which stays as a mirror
    // the API still accepts and returns. Copy it over so those syncs keep covering their subfolders.
    await knex.raw(`ALTER TABLE ${TableName.SecretSync} DISABLE TRIGGER "${TableName.SecretSync}_updatedAt"`);
    await knex(TableName.SecretSync)
      .whereRaw(`"syncOptions"->>'includeAllSubFolders' = 'true'`)
      .update({ includeAllSubFolders: true });
    await knex.raw(`ALTER TABLE ${TableName.SecretSync} ENABLE TRIGGER "${TableName.SecretSync}_updatedAt"`);
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.SecretSync, "includeAllSubFolders")) {
    await knex.schema.alterTable(TableName.SecretSync, (t) => {
      t.dropColumn("includeAllSubFolders");
    });
  }
}
