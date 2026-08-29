import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "templateId"))) {
    await knex.schema.alterTable(TableName.IdentityKubernetesAuth, (t) => {
      t.uuid("templateId").nullable();
      t.foreign("templateId").references("id").inTable(TableName.IdentityAuthTemplate).onDelete("SET NULL");
      t.index("templateId");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "templateId")) {
    await knex.schema.alterTable(TableName.IdentityKubernetesAuth, (t) => {
      t.dropForeign(["templateId"]);
      t.dropColumn("templateId");
    });
  }
}
