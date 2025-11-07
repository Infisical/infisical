import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PkiCertificateTemplateV2)) {
    await knex.schema.alterTable(TableName.PkiCertificateTemplateV2, (t) => {
      t.dropForeign(["projectId"]);
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PkiCertificateTemplateV2)) {
    await knex.schema.alterTable(TableName.PkiCertificateTemplateV2, (t) => {
      t.dropForeign(["projectId"]);
      t.foreign("projectId").references("id").inTable(TableName.Project);
    });
  }
}
