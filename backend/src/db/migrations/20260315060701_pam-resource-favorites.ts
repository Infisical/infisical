import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.PamResourceFavorite))) {
    await knex.schema.createTable(TableName.PamResourceFavorite, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("userId").notNullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");

      t.uuid("pamResourceId").notNullable();
      t.foreign("pamResourceId").references("id").inTable(TableName.PamResource).onDelete("CASCADE");

      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");

      t.timestamp("createdAt", { useTz: true }).defaultTo(knex.fn.now());

      t.unique(["userId", "pamResourceId"], {
        indexName: "uidx_pam_resource_favorite_user_resource"
      });

      t.index(["userId", "projectId"], "idx_pam_resource_favorite_user_project");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.PamResourceFavorite);
}
